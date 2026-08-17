/*
  ========================================================================
  PANDUAN KONFIGURASI GEMINI API KEY:
  1. Dapatkan API Key melalui Google AI Studio: https://aistudio.google.com/
  2. Salin API key dan ganti string di bawah ini pada konstanta GEMINI_API_KEY.
  ========================================================================
*/

// #DEV-ONLY: API Key dan Endpoint kini dipindahkan ke Cloudflare Pages Functions (backend)
// Endpoint lokal untuk fetch request
const GEMINI_ENDPOINT = "/api/gemini";

// #DEV-ONLY: Mendefinisikan System Prompt untuk mengatur kepribadian chatbot dan aturan format keluaran
const SYSTEM_PROMPT = `
Kamu adalah Time Manager, manajer waktu yang ramah, sabar, dan menyenangkan untuk siswa sekolah.
Jawab semua pertanyaan dalam Bahasa Indonesia yang jelas dan mudah dipahami.
Gunakan format pesan untuk menjawab yakni: "Sebagai Time Manager, buatkan jadwal waktu yang efisien dalam memanfaatkan waktu luang yang tersedia. Waktu luangku ialah Senin {input datetime atau Tidak ada}, Selasa {input datetime atau Tidak ada}, Rabu {input datetime atau Tidak ada}, Kamis {input datetime atau Tidak ada}, Jum'at {input datetime atau Tidak ada}, Sabtu {input datetime atau Tidak ada}, dan Minggu {input datetime atau Tidak ada}. Lalu tugas-tugasku ialah {input Nama dari tugas index 0} dengan tingkat kepentingan {input tingkat kepentingan}/10, tenggat waktu {input datetime HTML}, dan tingkat kesulitan {input tingkat kesulitan}/10. BUATKAN JAWABAN DALAM BENTUK FORMAT: \`Senin: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\", Selasa: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\", Rabu: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\", Kamis: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\", Jum'at: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\", Sabtu: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\", dan Minggu: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\"\`"
Jika input terjadi invalid, arahkan pengguna bagaimana cara memberikan input kembali dengan benar.
Gunakan emoji sesekali agar terasa lebih ramah dan menyenangkan.
`;

// #DEV-ONLY: Mendefinisikan array riwayat percakapan yang disimpan di memori agar percakapan bersifat multi-turn
let chatHistory = [];

// #DEV-ONLY: Mendefinisikan event listener utama yang berjalan saat halaman web siap dimuat
document.addEventListener("DOMContentLoaded", () => {
  // #DEV-ONLY: Memuat dan memulihkan riwayat obrolan dari sessionStorage jika tersedia
  loadChatHistoryFromStorage();

  // Memuat data waktu luang dari localStorage
  const savedFreetime = localStorage.getItem("time_manager_freetime");
  if (savedFreetime) {
    try {
      const freetime = JSON.parse(savedFreetime);
      const days = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"];
      days.forEach(day => {
        if (freetime[day] !== undefined) {
          document.getElementById(day).value = freetime[day];
        }
      });
    } catch (e) {
      console.warn("Gagal membaca data waktu luang dari localStorage:", e);
    }
  }

  // Memuat tugas dari localStorage jika ada, kalau tidak gunakan default
  const savedTasks = localStorage.getItem("time_manager_tasks");
  if (savedTasks) {
    try {
      const tasks = JSON.parse(savedTasks);
      if (tasks.length > 0) {
        tasks.forEach(t => addTaskRow(t.name, t.importance, t.deadline, t.difficulty));
      } else {
        addTaskRow("", 5, getDefaultDateTime(1), 5);
      }
    } catch (e) {
      addTaskRow("Matematika", 8, getDefaultDateTime(1), 7);
      addTaskRow("Vibe Coding", 9, getDefaultDateTime(2), 6);
      addTaskRow("Bahasa Indonesia", 6, getDefaultDateTime(3), 5);
    }
  } else {
    // #DEV-ONLY: Menambahkan input tugas default (contoh awal) ke dalam form saat pertama dibuka
    addTaskRow("Matematika", 8, getDefaultDateTime(1), 7);
    addTaskRow("Vibe Coding", 9, getDefaultDateTime(2), 6);
    addTaskRow("Bahasa Indonesia", 6, getDefaultDateTime(3), 5);
  }

  // Mulai interval Timer
  setInterval(updateTimer, 1000);

  // #DEV-ONLY: Mendaftarkan handler untuk tombol tambah tugas
  document.getElementById("btn-add-task").addEventListener("click", () => {
    addTaskRow("", 5, getDefaultDateTime(1), 5);
  });

  // #DEV-ONLY: Mendaftarkan handler untuk tombol submit (Kirim)
  document.getElementById("btn-submit").addEventListener("click", handleSubmit);

  // #DEV-ONLY: Mendaftarkan handler untuk tombol reset form
  document.getElementById("btn-reset").addEventListener("click", resetForm);

  // #DEV-ONLY: Mendaftarkan event listener shortcut keyboard (tekan Enter pada form untuk langsung mengirim)
  document.querySelector(".form-card").addEventListener("keydown", (e) => {
    // #DEV-ONLY: Memeriksa apakah tombol yang ditekan adalah Enter dan bukan dari textarea
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA" && e.target.type !== "button") {
      // #DEV-ONLY: Mencegah reload halaman secara default saat Enter ditekan
      e.preventDefault();
      // #DEV-ONLY: Memanggil fungsi submit
      handleSubmit();
    }
  });
});

// #DEV-ONLY: Mendefinisikan fungsi bantuan untuk menghasilkan format default ISO tanggal-waktu HTML (YYYY-MM-DDTHH:MM)
function getDefaultDateTime(daysAhead = 1) {
  // #DEV-ONLY: Mengambil tanggal saat ini dan menambah hari sesuai parameter
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  // #DEV-ONLY: Mengatur penyesuaian zona waktu agar format datetime-local HTML akurat
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  // #DEV-ONLY: Mengembalikan karakter substring berformat valid untuk input datetime-local
  return d.toISOString().slice(0, 16);
}

// #DEV-ONLY: Mendefinisikan fungsi untuk membuat elemen baris input tugas baru di dalam DOM
function addTaskRow(name = "", importance = 5, deadline = "", difficulty = 5) {
  // #DEV-ONLY: Mengambil elemen kontainer tugas dari DOM
  const container = document.getElementById("tasks-container");

  // #DEV-ONLY: Membuat elemen div baru berkelas task-item
  const taskDiv = document.createElement("div");
  taskDiv.className = "task-item";

  // #DEV-ONLY: Memasukkan string HTML template untuk field-field input tugas ke dalam elemen taskDiv
  taskDiv.innerHTML = `
    <div class="task-field">
      <label>Nama Tugas</label>
      <input type="text" class="task-name" value="${name}" placeholder="Contoh: Matematika">
    </div>
    <div class="task-field">
      <label>Tingkat Kepentingan (1-10)</label>
      <input type="number" class="task-importance" min="1" max="10" value="${importance}">
    </div>
    <div class="task-field">
      <label>Tenggat Waktu</label>
      <input type="datetime-local" class="task-deadline" value="${deadline}">
    </div>
    <div class="task-field">
      <label>Tingkat Kesulitan (1-10)</label>
      <input type="number" class="task-difficulty" min="1" max="10" value="${difficulty}">
    </div>
    <div class="task-field">
      <button type="button" class="btn-danger-sm btn-remove-task">Hapus</button>
    </div>
  `;

  // #DEV-ONLY: Menambahkan event listener pada tombol "Hapus" pada baris tugas tersebut
  taskDiv.querySelector(".btn-remove-task").addEventListener("click", () => {
    // #DEV-ONLY: Memeriksa jumlah total baris tugas agar tidak kurang dari aturan minimal 1 tugas
    if (document.querySelectorAll(".task-item").length > 1) {
      // #DEV-ONLY: Menghapus elemen baris tugas dari kontainer DOM
      taskDiv.remove();
    } else {
      // #DEV-ONLY: Menampilkan notifikasi peringatan jika pengguna mencoba menghapus tugas terakhir
      alert("Minimal harus terdapat 1 daftar tugas ya!");
    }
  });

  // #DEV-ONLY: Menambahkan baris tugas yang baru disiapkan ke dalam kontainer
  container.appendChild(taskDiv);
}

// #DEV-ONLY: Mendefinisikan fungsi untuk mereset seluruh formulir ke nilai defaultnya
function resetForm() {
  // #DEV-ONLY: Mengisi kembali input waktu luang dengan teks default
  document.getElementById("senin").value = "15.30 - 21.30";
  document.getElementById("selasa").value = "15.30 - 21.30";
  document.getElementById("rabu").value = "Tidak ada";
  document.getElementById("kamis").value = "15.30 - 21.30";
  document.getElementById("jumat").value = "15.30 - 21.30";
  document.getElementById("sabtu").value = "06.00 - 21.00";
  document.getElementById("minggu").value = "06.00 - 21.00";

  // #DEV-ONLY: Mengosongkan kontainer daftar tugas
  document.getElementById("tasks-container").innerHTML = "";
  // #DEV-ONLY: Memasang kembali minimal 1 tugas kosong baru setelah form direset
  addTaskRow("", 5, getDefaultDateTime(1), 5);
}

// #DEV-ONLY: Mendefinisikan fungsi untuk menyusun string prompt sesuai spesifikasi baku form
function buildPrompt() {
  // #DEV-ONLY: Mengambil nilai input waktu luang per hari dalam 1 minggu
  const senin = document.getElementById("senin").value.trim() || "Tidak ada";
  const selasa = document.getElementById("selasa").value.trim() || "Tidak ada";
  const rabu = document.getElementById("rabu").value.trim() || "Tidak ada";
  const kamis = document.getElementById("kamis").value.trim() || "Tidak ada";
  const jumat = document.getElementById("jumat").value.trim() || "Tidak ada";
  const sabtu = document.getElementById("sabtu").value.trim() || "Tidak ada";
  const minggu = document.getElementById("minggu").value.trim() || "Tidak ada";

  // #DEV-ONLY: Mengambil seluruh elemen tugas yang ada saat ini di form
  const taskElements = document.querySelectorAll(".task-item");
  // #DEV-ONLY: Memvalidasi keberadaan tugas sebelum lanjut diproses
  if (taskElements.length === 0) return "";

  // #DEV-ONLY: Mengambil data khusus dari tugas pada urutan index 0 sesuai standar string template
  const firstTask = taskElements[0];
  const name0 = firstTask.querySelector(".task-name").value.trim() || "Tugas Umum";
  const imp0 = firstTask.querySelector(".task-importance").value || "5";
  const dead0 = firstTask.querySelector(".task-deadline").value || "Tidak ditentukan";
  const diff0 = firstTask.querySelector(".task-difficulty").value || "5";

  // #DEV-ONLY: Menyusun teks prompt lengkap berdasarkan ketentuan template pada instruksi
  let promptText = `Sebagai Time Manager, buatkan jadwal waktu yang efisien dalam memanfaatkan waktu luang yang tersedia. Waktu luangku ialah Senin ${senin}, Selasa ${selasa}, Rabu ${rabu}, Kamis ${kamis}, Jum'at ${jumat}, Sabtu ${sabtu}, dan Minggu ${minggu}. Lalu tugas-tugasku ialah ${name0} dengan tingkat kepentingan ${imp0}/10, tenggat waktu ${dead0}, dan tingkat kesulitan ${diff0}/10.`;

  // #DEV-ONLY: Mengecek apakah pengguna memiliki lebih dari 1 tugas, jika ya kita tambahkan detail tugas lainnya
  if (taskElements.length > 1) {
    promptText += " Tugas lanjutanku lainnya adalah: ";
    // #DEV-ONLY: Melakukan loop untuk menambahkan detail setiap tugas setelah indeks pertama
    for (let i = 1; i < taskElements.length; i++) {
      const name = taskElements[i].querySelector(".task-name").value.trim() || `Tugas ${i + 1}`;
      const imp = taskElements[i].querySelector(".task-importance").value || "5";
      const dead = taskElements[i].querySelector(".task-deadline").value || "-";
      const diff = taskElements[i].querySelector(".task-difficulty").value || "5";
      promptText += `[${name}: penting ${imp}/10, tenggat ${dead}, sulit ${diff}/10] `;
    }
  }

  // #DEV-ONLY: Menambahkan kalimat penutup penegasan format output ke bagian akhir string prompt
  promptText += `
  BUATKAN JAWABAN DALAM BENTUK FORMAT \`Senin: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\", Selasa: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\", Rabu: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\", Kamis: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\", Jum'at: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\", Sabtu: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\", dan Minggu: \"{daftar nama tugas beserta waktu pengerjaannya setiap tugas, atau Tidak ada}\"\`!
  Jika ditemukan invalid input atau format yang tidak sesuai, berikan pesan \"INVALID\" di jawaban paling atas!
  `;

  // #DEV-ONLY: Mengembalikan string prompt akhir yang siap dikirimkan
  return promptText;
}

// #DEV-ONLY: Mendefinisikan fungsi untuk menyimpan data form tugas ke localStorage
function saveTasksToStorage() {
  const taskElements = document.querySelectorAll(".task-item");
  const tasks = [];
  taskElements.forEach(task => {
    tasks.push({
      name: task.querySelector(".task-name").value,
      importance: task.querySelector(".task-importance").value,
      deadline: task.querySelector(".task-deadline").value,
      difficulty: task.querySelector(".task-difficulty").value
    });
  });
  localStorage.setItem("time_manager_tasks", JSON.stringify(tasks));
}

function saveFreetimeToStorage() {
  const freetime = {
    senin: document.getElementById("senin").value,
    selasa: document.getElementById("selasa").value,
    rabu: document.getElementById("rabu").value,
    kamis: document.getElementById("kamis").value,
    jumat: document.getElementById("jumat").value,
    sabtu: document.getElementById("sabtu").value,
    minggu: document.getElementById("minggu").value
  };
  localStorage.setItem("time_manager_freetime", JSON.stringify(freetime));
}

// #DEV-ONLY: Mendefinisikan fungsi penanganan saat form dikirimkan
async function handleSubmit() {
  // Simpan data tugas ke LocalStorage
  saveTasksToStorage();
  saveFreetimeToStorage();

  // #DEV-ONLY: Menyusun pesan dari form pengguna menggunakan fungsi buildPrompt
  const userPrompt = buildPrompt();

  // #DEV-ONLY: Menampilkan pesan user ke layar obrolan di sebelah kanan
  appendChatMessage("user", userPrompt);

  // #DEV-ONLY: Memunculkan indikator loading "Time Manager sedang menyusun..."
  document.getElementById("loading-indicator").style.display = "flex";

  // #DEV-ONLY: Menggulir area obrolan agar pesan terbaru terlihat
  scrollToBottom();

  try {
    // #DEV-ONLY: Memanggil API Gemini dan menunggu respons dari model
    const botReply = await callGeminiAPI(userPrompt);

    // #DEV-ONLY: Menyembunyikan indikator loading
    document.getElementById("loading-indicator").style.display = "none";

    // #DEV-ONLY: Menampilkan balasan chatbot Time Manager ke layar di sebelah kiri
    appendChatMessage("model", botReply);

    // Cek jika ada respons INVALID
    if (botReply.trim().startsWith("INVALID") || botReply.includes("INVALID")) {
      alert("ERROR: invalid input or something wrong. Try again");
      return;
    }

    // #DEV-ONLY: Mengekstrak data jadwal dari teks balasan dan merendernya ke tabel HTML
    parseScheduleToTable(botReply);

    // #DEV-ONLY: Memunculkan seksi tabel hasil jadwal
    document.getElementById("result-section").style.display = "block";
  } catch (error) {
    // #DEV-ONLY: Menyembunyikan indikator loading saat terjadi kegagalan sistem
    document.getElementById("loading-indicator").style.display = "none";
    // #DEV-ONLY: Menampilkan pesan ramah penanganan error ke dalam obrolan
    const errorMsg = "INVALID\n\nUps, Time Manager sedang sibuk sekarang. Coba lagi ya! 🙏 (" + error.message + ")";
    appendChatMessage("model", errorMsg);

    // Alert untuk kegagalan sistem
    alert(errorMsg);
  }
}

// #DEV-ONLY: Mendefinisikan fungsi asynchronous untuk melakukan HTTP POST ke Google Gemini API
async function callGeminiAPI(userText) {
  // #DEV-ONLY: Menyusun struktur percakapan dengan menambahkan pesan baru ke dalam payload
  const contentsPayload = [
    ...chatHistory,
    {
      role: "user",
      parts: [{ text: userText }]
    }
  ];

  // #DEV-ONLY: Melakukan fetch API dengan konfigurasi method, headers, dan body berupa system_instruction serta contents
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: contentsPayload
    })
  });

  // #DEV-ONLY: Memeriksa apakah response HTTP dalam kondisi baik
  if (!response.ok) {
    // #DEV-ONLY: Melempar error jika terjadi masalah dengan request HTTP
    throw new Error(`HTTP Error: ${response.status}`);
  }

  // #DEV-ONLY: Mengubah respons JSON API ke dalam object JavaScript
  const data = await response.json();

  // #DEV-ONLY: Mengekstrak string teks dari struktur balasan API Gemini
  const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, aku tidak dapat memuat jadwalmu saat ini.";

  // #DEV-ONLY: Memeriksa apakah histori mencapai 30 item
  // Jika tercapai atau lebih, hapus histori paling terlama (pasangan user dan model)
  while (chatHistory.length >= 30) {
    chatHistory.splice(0, 2);
  }

  // #DEV-ONLY: Menambahkan turn input user terbaru ke dalam riwayat memori
  chatHistory.push({ role: "user", parts: [{ text: userText }] });
  // #DEV-ONLY: Menambahkan turn respons model terbaru ke dalam riwayat memori
  chatHistory.push({ role: "model", parts: [{ text: replyText }] });

  // #DEV-ONLY: Menyimpan pembaruan riwayat chat ke dalam sessionStorage
  saveChatHistoryToStorage();

  // #DEV-ONLY: Mengembalikan string jawaban akhir dari Time Manager
  return replyText;
}

// #DEV-ONLY: Mendefinisikan fungsi untuk mengubah teks balasan AI menjadi baris pada tabel jadwal HTML
function parseScheduleToTable(text) {
  // #DEV-ONLY: Mengambil elemen tbody dari tabel jadwal
  const tbody = document.getElementById("schedule-tbody");
  // #DEV-ONLY: Menyimpan data sebelumnya untuk di-revert jika gagal
  const previousHTML = tbody.innerHTML;
  
  // #DEV-ONLY: Mengosongkan isi tabel sebelum memasukkan baris baru
  tbody.innerHTML = "";

  // #DEV-ONLY: Mendefinisikan daftar hari resmi dalam satu minggu sesuai format target
  const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu", "Minggu"];
  
  let hasValidData = false;

  // #DEV-ONLY: Melakukan iterasi untuk setiap hari untuk mencari keberadaan hari di dalam teks jawaban AI
  days.forEach((day, index) => {
    const regex = new RegExp(`(?<=${day}: ").*?(?=")`);
    const match = text.match(regex);
    
    if (match) {
      hasValidData = true;
    }

    let scheduleDetail = match ? match[0] : "Tidak ada";

    // #DEV-ONLY: Membuat elemen baris tabel (tr) baru untuk hari tersebut
    const tr = document.createElement("tr");
    // #DEV-ONLY: Memasukkan sel nama hari dan sel deskripsi jadwal tugas
    tr.innerHTML = `
      <td>${day}</td>
      <td>${scheduleDetail || "Tidak ada"}</td>
    `;
    // #DEV-ONLY: Menambahkan baris tabel ke dalam tbody DOM
    tbody.appendChild(tr);
  });

  if (!hasValidData) {
    // #DEV-ONLY: Mengembalikan isi tabel ke data sebelumnya dan memberikan alert
    tbody.innerHTML = previousHTML;
    alert("ERROR: Gagal menguraikan isi pesan ke dalam bentuk tabel jadwal. Coba lagi ya! 🙏");
  }
}

// #DEV-ONLY: Mendefinisikan fungsi untuk merender bubble obrolan pada riwayat percakapan di DOM
function appendChatMessage(role, text) {
  // #DEV-ONLY: Mengambil elemen box obrolan dari halaman
  const chatBox = document.getElementById("chat-history");

  // #DEV-ONLY: Membuat elemen div baru untuk gelembung pesan
  const bubble = document.createElement("div");
  // #DEV-ONLY: Menyesuaikan kelas CSS berdasarkan pengirim (user atau model/bot)
  bubble.className = `chat-bubble ${role === "user" ? "chat-user" : "chat-bot"}`;

  // #DEV-ONLY: Mengonversi baris baru menjadi tag break (<br>) agar keterbacaan teks terjaga dengan rapi
  const formattedText = text.replace(/\n/g, "<br>");
  // #DEV-ONLY: Memasukkan teks yang sudah diformat ke dalam gelembung obrolan
  bubble.innerHTML = formattedText;

  // #DEV-ONLY: Menyisipkan bubble obrolan ke dalam kotak chat
  chatBox.appendChild(bubble);
  // #DEV-ONLY: Menggulirkan tampilan ke bawah agar pesan terlihat
  scrollToBottom();
}

// #DEV-ONLY: Mendefinisikan fungsi untuk mengarahkan scroll obrolan ke posisi paling bawah (terbaru)
function scrollToBottom() {
  // #DEV-ONLY: Mengambil kontainer riwayat obrolan dan menyetel scrollTop ke nilai scrollHeight
  const chatBox = document.getElementById("chat-history");
  chatBox.scrollTop = chatBox.scrollHeight;
}

// #DEV-ONLY: Mendefinisikan fungsi penyimpanan riwayat obrolan ke dalam penyimpanan peramban (sessionStorage)
function saveChatHistoryToStorage() {
  try {
    // #DEV-ONLY: Mengubah array riwayat chat menjadi string JSON dan menyimpannya di sessionStorage
    sessionStorage.setItem("time_manager_chat_history", JSON.stringify(chatHistory));
  } catch (e) {
    // #DEV-ONLY: Menangani potensi error saat kapasitas storage browser penuh atau dinonaktifkan
    console.warn("Gagal menyimpan riwayat ke sessionStorage:", e);
  }
}

// #DEV-ONLY: Mendefinisikan fungsi untuk memuat kembali riwayat chat dari penyimpanan peramban
function loadChatHistoryFromStorage() {
  // #DEV-ONLY: Mengambil string JSON riwayat obrolan dari sessionStorage
  const saved = sessionStorage.getItem("time_manager_chat_history");
  // #DEV-ONLY: Memverifikasi apakah data tersimpan benar-benar tersedia
  if (saved) {
    try {
      // #DEV-ONLY: Menguraikan string JSON menjadi array JavaScript asli
      chatHistory = JSON.parse(saved);
      // #DEV-ONLY: Melakukan loop terhadap semua pesan yang disimpan untuk dirender kembali ke layar
      chatHistory.forEach(item => {
        const text = item.parts?.[0]?.text || "";
        appendChatMessage(item.role, text);
      });
      // #DEV-ONLY: Memperbarui isi tabel secara otomatis menggunakan teks dari jawaban AI terakhir
      const lastModelMsg = [...chatHistory].reverse().find(msg => msg.role === "model");
      if (lastModelMsg) {
        parseScheduleToTable(lastModelMsg.parts[0].text);
        document.getElementById("result-section").style.display = "block";
      }
    } catch (e) {
      // #DEV-ONLY: Membersihkan sesi jika format data yang disimpan rusak/korup
      console.warn("Gagal membaca riwayat sessionStorage:", e);
      sessionStorage.removeItem("time_manager_chat_history");
    }
  }
}

let alarmTriggeredForTarget = null;
let alarmInterval = null;

// #DEV-ONLY: Fungsi membunyikan alarm keras menggunakan Web Audio API
function playLoudAlarm() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const ctx = new AudioContext();
  let toggle = false;

  const playBeep = () => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = toggle ? 1200 : 900;
    toggle = !toggle;

    gain.gain.value = 1;
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    // Fade out halus agar tidak ada suara klik yang mengganggu
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.25);
    osc.stop(ctx.currentTime + 0.3);
  };

  playBeep();
  alarmInterval = setInterval(playBeep, 250);

  // Hentikan alarm setelah 10 detik
  setTimeout(() => {
    clearInterval(alarmInterval);
  }, 10000);
}

// #DEV-ONLY: Fungsi untuk memperbarui Timer Hitung Mundur berdasarkan jadwal hari ini
function updateTimer() {
  const tbody = document.getElementById("schedule-tbody");
  if (!tbody || tbody.innerHTML.trim() === "") {
    document.getElementById("countdown-timer").innerText = "--:--:--";
    document.getElementById("timer-label").innerText = "Menunggu jadwal...";
    return;
  }

  const daysIndo = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"];
  const now = new Date();
  const todayName = daysIndo[now.getDay()];

  let todaySchedule = "";
  const rows = tbody.querySelectorAll("tr");
  rows.forEach(row => {
    const dayCell = row.querySelector("td:first-child");
    if (dayCell && dayCell.innerText.trim() === todayName) {
      const detailCell = row.querySelector("td:nth-child(2)");
      if (detailCell) todaySchedule = detailCell.innerText;
    }
  });

  if (!todaySchedule || todaySchedule === "Tidak ada") {
    document.getElementById("countdown-timer").innerText = "--:--:--";
    document.getElementById("timer-label").innerText = "Tidak ada jadwal hari ini.";
    return;
  }

  // Cari semua jam dalam teks (misal 15.30 atau 15:30)
  const timeRegex = /\b([0-1]?[0-9]|2[0-3])[.:]([0-5][0-9])\b/g;
  let match;
  const times = [];
  while ((match = timeRegex.exec(todaySchedule)) !== null) {
    times.push({
      hour: parseInt(match[1]),
      minute: parseInt(match[2]),
      index: match.index,
      length: match[0].length
    });
  }

  if (times.length === 0) {
    document.getElementById("countdown-timer").innerText = "--:--:--";
    document.getElementById("timer-label").innerText = "Tidak ada jam terdeteksi di jadwal.";
    return;
  }

  let nextTime = null;
  let nextTimeIndex = -1;
  for (let i = 0; i < times.length; i++) {
    const target = new Date();
    target.setHours(times[i].hour, times[i].minute, 0, 0);
    if (target > now) {
      nextTime = target;
      nextTimeIndex = i;
      break;
    }
  }

  // Ubah teks judul timer berdasarkan status pengerjaan
  const timerTitle = document.querySelector(".timer-section h2");
  if (timerTitle) {
    if (nextTimeIndex !== -1) {
      // Ekstrak nama tugas berdasarkan posisi teks di antara jam-jam tersebut
      const taskIdx = Math.floor(nextTimeIndex / 2);
      const startStrIdx = taskIdx === 0 ? 0 : (times[taskIdx * 2 - 1].index + times[taskIdx * 2 - 1].length);
      const endStrIdx = times[taskIdx * 2].index;
      let rawStr = todaySchedule.substring(startStrIdx, endStrIdx);

      // console.log(rawStr);

      let taskName = rawStr
        .replace(/^[\W+,\.\-]+/, "") // Hapus spasi dan tanda baca di awal
        .replace(/\b(lalu|kemudian|dan|selanjutnya|pukul|jam|pada|dari|mulai|sampai|hingga)\b/gi, "") // Hapus kata penghubung/waktu
        .replace(/^[\W+,\.\-]+/, "") // Hapus spasi dan tanda baca di awal
        .replace(/[^a-zA-Z0-9\s]+$/g, "") // Hapus simbol di akhir teks
        .replace(/\s{2,}/g, " ") // Rapikan spasi ganda
        .trim();

      // console.log(taskName);

      if (taskName) {
        if (nextTimeIndex % 2 === 0) {
          timerTitle.innerText = `Waktu menuju pengerjaan ${taskName}`;
        } else {
          timerTitle.innerText = `Sisa Waktu Pengerjaan ${taskName}`;
        }
      } else {
        if (nextTimeIndex % 2 === 0) {
          timerTitle.innerText = "Waktu menuju pengerjaan";
        } else {
          timerTitle.innerText = "Sisa Waktu Pengerjaan";
        }
      }
    } else {
      timerTitle.innerText = "Sisa Waktu Pengerjaan";
    }
  }

  if (nextTime) {
    const diff = nextTime - now;

    // Pemicu alarm pada sisa waktu 5 detik
    if (diff <= 6000 && diff > 4500 && alarmTriggeredForTarget !== nextTime.getTime()) {
      alarmTriggeredForTarget = nextTime.getTime();
      playLoudAlarm();
    }

    const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');

    document.getElementById("countdown-timer").innerText = `${h}:${m}:${s}`;
    document.getElementById("timer-label").innerText = `Menuju ${nextTime.getHours().toString().padStart(2, '0')}:${nextTime.getMinutes().toString().padStart(2, '0')}`;
  } else {
    document.getElementById("countdown-timer").innerText = "00:00:00";
    document.getElementById("timer-label").innerText = "Jadwal hari ini telah selesai!";
  }
}
