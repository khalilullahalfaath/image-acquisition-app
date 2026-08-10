import { toast, confirmModal, confirmModalMessage, confirmModalActions } from "./dom.js";

export function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("toast-hidden");
  setTimeout(() => toast.classList.add("toast-hidden"), 3000);
}

// Pengganti window.confirm()/window.prompt() bawaan browser -- tampilannya
// konsisten dengan desain aplikasi (bukan popup native OS/browser), dan tetap
// modal (nge-block interaksi lain sampai user pilih salah satu tombol).
// `choices` adalah array [{label, value, primary}], resolve dengan `value`
// dari tombol yang diklik. Dipakai buat kasus lebih dari sekadar
// Batal/Lanjutkan, mis. 3 pilihan di konfirmasi Proses Batch.
export function showChoiceModal(message, choices) {
  return new Promise((resolve) => {
    confirmModalMessage.textContent = message;
    confirmModalActions.innerHTML = "";

    function cleanup(value) {
      confirmModal.classList.add("modal-hidden");
      confirmModalActions.innerHTML = "";
      resolve(value);
    }

    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = choice.label;
      btn.className = "btn " + (choice.primary ? "btn-primary" : "btn-outline");
      btn.addEventListener("click", () => cleanup(choice.value));
      confirmModalActions.appendChild(btn);
    });

    confirmModal.classList.remove("modal-hidden");
  });
}

// Pengganti window.confirm() sederhana (2 pilihan: Batal/Lanjutkan) -- dibuat
// di atas showChoiceModal supaya semua pemanggil lama (doSave, dst) nggak
// perlu diubah.
export function showConfirmModal(message) {
  return showChoiceModal(message, [
    { label: "Batal", value: false },
    { label: "Lanjutkan", value: true, primary: true },
  ]);
}
