/* global Html5Qrcode */
(function () {
  const API_DEFAULT =
    "https://script.google.com/macros/s/AKfycbz_9wd0Q6onfA75yqlV0s5t9la-H-4bp8f11zpMLWaS0Pwo3A27LX90rssNs9NXaY-48w/exec";

  const el = (id) => document.getElementById(id);

  const apiBaseEl = el("apiBase");
  const staffIdEl = el("staffId");
  const netBadgeEl = el("netBadge");
  const queueCountEl = el("queueCount");
  const studentCountEl = el("studentCount");
  const btnSyncEl = el("btnSync");
  const btnInstallEl = el("btnInstall");
  const btnRefreshStudentsEl = el("btnRefreshStudents");
  const btnExportQueueEl = el("btnExportQueue");
  const btnClearQueueEl = el("btnClearQueue");

  const actionTypeEl = el("actionType");
  const studentSearchEl = el("studentSearch");
  const studentSelectEl = el("studentSelect");
  const selectedStudentIdEl = el("selectedStudentId");
  const selectedStudentNameEl = el("selectedStudentName");

  const refIdEl = el("refId");
  const qtyEl = el("qty");
  const notesEl = el("notes");
  const btnAddTxnEl = el("btnAddTxn");
  const btnResetEl = el("btnReset");
  const btnStartScanEl = el("btnStartScan");
  const btnStopScanEl = el("btnStopScan");

  const lastScanEl = el("lastScan");
  const deviceIdEl = el("deviceId");
  const readerId = "reader";

  let installPromptEvent = null;
  let scanner = null;

  function uuidv4() {
    // small UUID generator (good enough for dedupe)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (crypto.getRandomValues(new Uint8Array(1))[0] % 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getDeviceId() {
    const k = "cdlta_device_id";
    let v = localStorage.getItem(k);
    if (!v) {
      v = "dev_" + uuidv4().slice(0, 8);
      localStorage.setItem(k, v);
    }
    return v;
  }

  function setNetBadge() {
    const online = navigator.onLine;
    netBadgeEl.textContent = online ? "Online" : "Offline";
    netBadgeEl.style.borderColor = online ? "#2a5" : "#a22";
  }

  function saveSettings() {
    localStorage.setItem("cdlta_api_base", apiBaseEl.value.trim());
    localStorage.setItem("cdlta_staff_id", staffIdEl.value.trim());
  }

  function loadSettings() {
    apiBaseEl.value = localStorage.getItem("cdlta_api_base") || API_DEFAULT;
    staffIdEl.value = localStorage.getItem("cdlta_staff_id") || "";
  }

  function getApiBase() {
    return (apiBaseEl.value || "").trim();
  }

  function requiredStaffId() {
    const v = (staffIdEl.value || "").trim();
    if (!v) {
      alert("Staff ID is required.");
      staffIdEl.focus();
      return null;
    }
    return v;
  }

  function selectedStudent() {
    const v = studentSelectEl.value;
    if (!v) return { student_id: "", full_name: "" };
    try {
      return JSON.parse(v);
    } catch {
      return { student_id: "", full_name: "" };
    }
  }

  function setSelectedStudentUI(stu) {
    selectedStudentIdEl.textContent = stu.student_id || "—";
    selectedStudentNameEl.textContent = stu.full_name || "—";
  }

  function actionToRefType(action) {
    if (action === "ISSUE_BOOK" || action === "RETURN_BOOK") return "BOOK";
    if (action === "CONSUME" || action === "RESTOCK") return "ITEM";
    return "MIXED";
  }

  function normalizeQty(action) {
    if (action === "CONSUME" || action === "RESTOCK" || action === "ADJUST") {
      const n = Number(qtyEl.value);
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.floor(n);
    }
    return ""; // ignored
  }

  async function updateCounts() {
    const q = await CDLTA_IDB.getAll(CDLTA_IDB.STORE_QUEUE);
    queueCountEl.textContent = String(q.length);

    const students = await CDLTA_IDB.getAll(CDLTA_IDB.STORE_STUDENTS);
    studentCountEl.textContent = String(students.length);
  }

  async function loadStudentsToDropdown(filterText = "") {
    const students = await CDLTA_IDB.getAll(CDLTA_IDB.STORE_STUDENTS);

    const t = (filterText || "").toLowerCase().trim();
    const filtered = t
      ? students.filter((s) => {
          const id = (s.student_id || "").toLowerCase();
          const nm = (s.full_name || "").toLowerCase();
          return id.includes(t) || nm.includes(t);
        })
      : students;

    // Keep current selection if possible
    const currentVal = studentSelectEl.value;

    studentSelectEl.innerHTML = `<option value="">— Select student —</option>`;
    for (const s of filtered.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""))) {
      const val = JSON.stringify({ student_id: s.student_id, full_name: s.full_name });
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = `${s.full_name} (${s.student_id})`;
      studentSelectEl.appendChild(opt);
    }

    // Restore selection if it still exists
    if (currentVal) {
      for (const opt of Array.from(studentSelectEl.options)) {
        if (opt.value === currentVal) {
          studentSelectEl.value = currentVal;
          setSelectedStudentUI(selectedStudent());
          break;
        }
      }
    }
  }

  async function refreshStudentsFromServer() {
    if (!navigator.onLine) {
      alert("You are offline. Students list can be refreshed when online.");
      return;
    }
    const base = getApiBase();
    if (!base) return;

    try {
      btnRefreshStudentsEl.disabled = true;
      btnRefreshStudentsEl.textContent = "Refreshing…";

      const url = `${base}?route=students`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();

      if (!data.ok) throw new Error(data.error || "Failed to fetch students");

      // Replace local students store
      await CDLTA_IDB.clear(CDLTA_IDB.STORE_STUDENTS);
      for (const s of data.students || []) {
        if (!s.student_id) continue;
        await CDLTA_IDB.put(CDLTA_IDB.STORE_STUDENTS, {
          student_id: s.student_id,
          full_name: s.full_name || "",
          status: s.status || "Active",
        });
      }

      await loadStudentsToDropdown(studentSearchEl.value);
      await updateCounts();
      alert(`Students refreshed: ${data.count || 0}`);
    } catch (err) {
      alert(`Refresh failed: ${err.message || String(err)}`);
    } finally {
      btnRefreshStudentsEl.disabled = false;
      btnRefreshStudentsEl.textContent = "Refresh Students List";
    }
  }

  async function queueTransaction(txn) {
    await CDLTA_IDB.put(CDLTA_IDB.STORE_QUEUE, txn);
    await updateCounts();
  }

  async function syncQueue() {
    if (!navigator.onLine) {
      setNetBadge();
      alert("Offline. Queue will sync when internet returns.");
      return;
    }

    const staffId = requiredStaffId();
    if (!staffId) return;

    const base = getApiBase();
    if (!base) return;

    const queued = await CDLTA_IDB.getAll(CDLTA_IDB.STORE_QUEUE);
    if (queued.length === 0) {
      await updateCounts();
      return;
    }

    // Batch upload
    btnSyncEl.disabled = true;
    btnSyncEl.textContent = "Syncing…";

    try {
      const url = `${base}?route=transactions`;
      const body = JSON.stringify({ transactions: queued });

      // IMPORTANT:
      // Avoid CORS preflight (OPTIONS) by NOT using application/json.
      // Apps Script can still read e.postData.contents as a string.
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Sync failed");

      // Remove successfully uploaded txns (we rely on txn_id dedupe on server anyway)
      for (const t of queued) {
        await CDLTA_IDB.del(CDLTA_IDB.STORE_QUEUE, t.txn_id);
      }

      await updateCounts();
      btnSyncEl.textContent = "Sync Now";
    } catch (err) {
      alert(`Sync failed: ${err.message || String(err)}`);
      btnSyncEl.textContent = "Sync Now";
    } finally {
      btnSyncEl.disabled = false;
    }
  }

  function resetForm() {
    refIdEl.value = "";
    qtyEl.value = "1";
    notesEl.value = "";
    lastScanEl.textContent = "—";
  }

  async function addTransactionFromForm() {
    const staffId = requiredStaffId();
    if (!staffId) return;

    const action = actionTypeEl.value;
    const refId = (refIdEl.value || "").trim();
    if (!refId) {
      alert("Scan or enter Ref ID (Book_ID or item barcode).");
      refIdEl.focus();
      return;
    }

    const qty = normalizeQty(action);
    if (qty === null) {
      alert("Quantity must be a positive number for this action.");
      qtyEl.focus();
      return;
    }

    const stu = selectedStudent();
    // For ISSUE_BOOK it’s strongly expected; for others it can be empty.
    if (action === "ISSUE_BOOK" && !stu.student_id) {
      alert("Select a student for Issue Book.");
      return;
    }

    const txn = {
      txn_id: uuidv4(),
      device_id: getDeviceId(),
      staff_id: staffId,
      timestamp: nowIso(),
      action_type: action,
      ref_type: actionToRefType(action),
      ref_id: refId,
      student_id: stu.student_id || "",
      student_name: stu.full_name || "",
      quantity: qty,
      notes: (notesEl.value || "").trim(),
    };

    await queueTransaction(txn);
    resetForm();

    // try silent sync if online
    if (navigator.onLine) {
      syncQueue().catch(() => {});
    }
  }

  async function exportQueueJson() {
    const queued = await CDLTA_IDB.getAll(CDLTA_IDB.STORE_QUEUE);
    const blob = new Blob([JSON.stringify(queued, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cdlta_queue_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function clearQueueDanger() {
    const ok = confirm("Clear ALL queued (offline) transactions from this device? This cannot be undone.");
    if (!ok) return;
    await CDLTA_IDB.clear(CDLTA_IDB.STORE_QUEUE);
    await updateCounts();
  }

  // ---------- Scanner ----------
  async function startScanner() {
    if (scanner) return;

    // Make failures obvious (instead of silent)
    const Supported = window.Html5QrcodeSupportedFormats;
    if (!window.Html5Qrcode || !Supported) {
      alert(
        "Scanner library is not loaded. If you’re offline or the PWA cache is stale, the camera scanner won’t start.\n\nFix: host html5-qrcode locally in your repo and clear site storage."
      );
      return;
    }

    // html5-qrcode config: attempt to support QR + 1D barcodes
    const formats = [
      // QR
      Supported.QR_CODE,
      // Common 1D barcodes
      Supported.CODE_128,
      Supported.CODE_39,
      Supported.EAN_13,
      Supported.EAN_8,
      Supported.UPC_A,
      Supported.UPC_E,
      Supported.ITF,
    ];

    scanner = new Html5Qrcode(readerId);

    const config = {
      fps: 12,
      qrbox: { width: 250, height: 250 },
      formatsToSupport: formats,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    };

    try {
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        alert("No camera found on this device.");
        scanner = null;
        return;
      }

      // Choose back camera if available
      const back = cameras.find((c) => /back|rear|environment/i.test(c.label));
      const cameraId = (back || cameras[0]).id;

      await scanner.start(
        cameraId,
        config,
        (decodedText) => {
          const v = (decodedText || "").trim();
          if (!v) return;
          lastScanEl.textContent = v;
          refIdEl.value = v;
          // small vibration feedback if supported
          if (navigator.vibrate) navigator.vibrate(30);
        },
        () => {}
      );
    } catch (err) {
      alert(`Scanner start failed: ${err.message || String(err)}`);
      try {
        await stopScanner();
      } catch {}
    }
  }

  async function stopScanner() {
    if (!scanner) return;
    try {
      await scanner.stop();
      await scanner.clear();
    } finally {
      scanner = null;
    }
  }

  // ---------- PWA / Service Worker ----------
  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch {
      // ignore
    }
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPromptEvent = e;
    btnInstallEl.textContent = "Install App (PWA)";
  });

  async function handleInstall() {
    if (!installPromptEvent) {
      alert("If you’re on iPhone: Share → Add to Home Screen.\nIf you’re on Android: browser menu → Install app.");
      return;
    }
    installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    installPromptEvent = null;
  }

  // ---------- Init ----------
  async function init() {
    loadSettings();
    setNetBadge();

    const devId = getDeviceId();
    deviceIdEl.textContent = devId;

    apiBaseEl.addEventListener("change", () => {
      saveSettings();
    });

    staffIdEl.addEventListener("change", () => {
      saveSettings();
    });

    btnInstallEl.addEventListener("click", handleInstall);
    btnSyncEl.addEventListener("click", syncQueue);
    btnRefreshStudentsEl.addEventListener("click", refreshStudentsFromServer);
    btnExportQueueEl.addEventListener("click", exportQueueJson);
    btnClearQueueEl.addEventListener("click", clearQueueDanger);

    btnAddTxnEl.addEventListener("click", addTransactionFromForm);
    btnResetEl.addEventListener("click", resetForm);

    btnStartScanEl.addEventListener("click", startScanner);
    btnStopScanEl.addEventListener("click", stopScanner);

    studentSearchEl.addEventListener("input", async () => {
      await loadStudentsToDropdown(studentSearchEl.value);
    });

    studentSelectEl.addEventListener("change", () => {
      setSelectedStudentUI(selectedStudent());
    });

    window.addEventListener("online", () => {
      setNetBadge();
      // auto-sync when network returns
      syncQueue().catch(() => {});
    });

    window.addEventListener("offline", () => {
      setNetBadge();
    });

    // Adjust quantity behavior based on action
    actionTypeEl.addEventListener("change", () => {
      const a = actionTypeEl.value;
      if (a === "ISSUE_BOOK" || a === "RETURN_BOOK") {
        qtyEl.value = "1";
        qtyEl.disabled = true;
      } else {
        qtyEl.disabled = false;
      }
    });
    actionTypeEl.dispatchEvent(new Event("change"));

    await registerServiceWorker();
    await updateCounts();

    // Load dropdown from local cache
    await loadStudentsToDropdown("");

    // First-run suggestion: refresh students once online
    if (navigator.onLine) {
      const meta = await CDLTA_IDB.get(CDLTA_IDB.STORE_META, "students_refreshed_once");
      if (!meta) {
        // don’t force it; just a one-time gentle prompt
        setTimeout(() => {
          const ok = confirm("Refresh student list now? (Recommended for offline use)");
          if (ok) {
            refreshStudentsFromServer()
              .then(() => CDLTA_IDB.put(CDLTA_IDB.STORE_META, { key: "students_refreshed_once", value: "1" }))
              .catch(() => {});
          }
        }, 600);
      }
    }
  }

  init().catch((err) => alert(err.message || String(err)));
})();
