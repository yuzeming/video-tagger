
let video = <HTMLVideoElement>document.getElementById("main_video")!;
let timestamp = <HTMLSpanElement>document.getElementById("timestamp")!;
let timeline = <HTMLTextAreaElement>document.getElementById("timeline")!;
let add = <HTMLButtonElement>document.getElementById("add")!;
let event_text = <HTMLInputElement>document.getElementById("event_text")!;
let task_text = <HTMLInputElement>document.getElementById("task_text")!;
let file_select = <HTMLInputElement>document.getElementById("file_select")!;
let sync = <HTMLInputElement>document.getElementById("sync")!;
let save = document.getElementById("save")!;
let file_name = "timeline.txt";
let progressbar = <HTMLDivElement>document.getElementById("progressbar")!;
let bar = document.getElementById("bar")!;


let thumbnail_db;
const openRequest = window.indexedDB.open("thumbnail_db", 1);

openRequest.onerror = () => {
  console.error("Database failed to open");
};

openRequest.onsuccess = (e) => {
  thumbnail_db = openRequest.result;
}

openRequest.onupgradeneeded = (e) => {
  thumbnail_db = openRequest.result;
  const objectStore = thumbnail_db.createObjectStore("thumbnail_db", {keyPath:"timestamp"});
  objectStore.createIndex("timestamp", "timestamp", { unique: true });
};

progressbar.addEventListener("click", (e) => {
    let x = e.offsetX;
    let w = progressbar.offsetWidth;
    let t = x / w * video.duration;
    video.currentTime = t;
});

progressbar.addEventListener("mousemove", (e) => {
  if (isNaN(video.duration)) {return;}
    let x = e.offsetX;
    let w = progressbar.offsetWidth;
    let t = Math.trunc(x / w * video.duration);
    let time = toTimeFormat(t);
    let tooltip = document.getElementById("tooltip")!;
    tooltip.style.display = "block";
    tooltip.style.left = e.pageX + 10 + "px";
    tooltip.style.top = progressbar.offsetTop - 120 + "px";

    let thumbnail_time = document.getElementById("thumbnail_time")!;
    thumbnail_time.innerHTML = time;
    let thumbnail_img = <HTMLImageElement> document.getElementById("thumbnail_img")!;

    let transaction = thumbnail_db.transaction("thumbnail_db", "readonly");
    let objectStore = transaction.objectStore("thumbnail_db");
    let request = objectStore.get(t);
    request.addEventListener("success", (e) => {
      let data = e.target.result;
      if (data == null) {return;}
      thumbnail_img.src = data.thumbnail;
    });
});

// progressbar.addEventListener("mouseout", (e) => {
//     let tooltip = document.getElementById("tooltip");
//     tooltip.style.display = "none";
// });


function gen_thumbnail(vid) {
  vid.currentTime = 0;
  vid.addEventListener("loadeddata", () => {
    console.log("loadeddata", new Date().getTime());
    console.log(vid.videoWidth, vid.videoHeight);
    const canvas = new OffscreenCanvas(160, 90);
    canvas.width = 160;
    canvas.height = 90;
    let thumbnail_list = []
    while (vid.currentTime < vid.duration) {
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      const thumbnail = ctx.toDataURL("image/png");
      thumbnail_list.push(thumbnail);
      vid.currentTime += 1;
      if (thumbnail_list.length > 600) {break;} // debug
      if (thumbnail_list.length % 60 == 0) {
        console.log(thumbnail);
      }
    }
    console.log("gen_thumbnail" , new Date().getTime());
    const transaction = thumbnail_db.transaction("thumbnail_db", "readwrite");
    const objectStore = transaction.objectStore("thumbnail_db");
    for (let i = 0; i < thumbnail_list.length; i++) {
      const request = objectStore.add({timestamp: i, thumbnail: thumbnail_list[i]});
      // request.addEventListener("success", () => {
      //   console.log("thumbnail added");
      // });
    }
    console.log("objectStore" , new Date().getTime());
  });
}

function initThumbnaildb() {
}

function toTimeFormat(t) {
    return new Date(t * 1000).toISOString().substr(11, 8);
}

video.addEventListener("click", (e) => {
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
});

video.addEventListener("timeupdate", function() {
    let t = video.currentTime.toFixed(0);
    bar.style.width = (video.currentTime / video.duration) * 100 + "%";
    timestamp.innerHTML = toTimeFormat(t);
});

let status_icon = document.getElementById("status_icon")!;

video.addEventListener("play", (e) => {
    status_icon.className = "bi bi-play-circle";
});

video.addEventListener("pause", (e) => {
    status_icon.className = "bi bi-pause-circle";
});

add.addEventListener("click", () => {
    timeline.value += timestamp.innerHTML + " ["+ task_text.value + "] " + event_text.value + "\n";
    event_text.value = "";
    timeline.scrollTop = timeline.scrollHeight;
    video.play();
});

event_text.addEventListener("keydown", (e) => {
    if (e.keyCode === 13) {
        e.preventDefault();
        add.click();
    }
});

let play_button = document.getElementById("paly")!;
play_button.addEventListener("click", (e) => {
    video.play();
});

let pause_button = document.getElementById("pause")!;
pause_button.addEventListener("click", (e) => {
    video.pause();
});

file_select.addEventListener('change', () => {
  if (file_select.files == null || file_select.files.length == 0) {return;}
  let file = file_select.files[0]
  if (video.canPlayType(file.type) == '') {
    alert('Can\'t play: "' + file.type + '" type!')
    return
  }
  video.src = window.URL.createObjectURL(file)
  gen_thumbnail(video.src);
  file_name = file.name + ".txt";
})

if (typeof(localStorage) === "undefined") {
  alert("localStorage not supported");
}

function setspeed(s){
    video.playbackRate = s;
};

timeline.addEventListener("change", (e) => {
    localStorage.setItem("timeline", timeline.value);
});

timeline.addEventListener("click", (e) => {
    if (!sync.checked) {return;}
    let lineNo = timeline.value.substr(0, timeline.selectionStart).split(/\r?\n|\r/).length;
    let t = timeline.value.split(/\r?\n|\r/)[lineNo - 1];
    let time = t.split(" ")[0];
    let time_s = time.split(":");
    let time_sec = parseInt(time_s[0]) * 3600 + parseInt(time_s[1]) * 60 + parseInt(time_s[2]);
    video.currentTime = time_sec;
});

window.addEventListener("load", () => {
    timeline.value = localStorage.getItem("timeline")||"";
});

window.addEventListener("beforeunload", () => {
    localStorage.setItem("timeline", timeline.value);
});

save.addEventListener("click", (e) => {
  let text = timeline.value;
  let elem = document.createElement('a');
  elem.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  elem.setAttribute('download', file_name);

  elem.style.display = 'none';
  document.body.appendChild(elem);
  elem.click();
  document.body.removeChild(elem);
});

window.addEventListener("keydown", (e) => {
  if (e.code == "F1") {
    e.preventDefault();
    if (video.paused) {
      video.play();
    } else {
      video.pause();
      event_text.focus();
    }
  } 
  else if (e.code == "ArrowRight") 
  {
    video.currentTime += 5;
  }
  else if (e.code == "ArrowLeft")
  {
    video.currentTime -= 5;
  }
});