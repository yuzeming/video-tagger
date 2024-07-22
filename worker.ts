importScripts("demuxer_mp4.js");

const ThumbnailHeight = 100;
const ThumbnailWidth = 160;


// Status UI. Messages are batched per animation frame.
let pendingStatus = null;

function setStatus(type, message) {
  console.log(type, message);
}

function statusAnimationFrame() {
  self.postMessage(pendingStatus);
  pendingStatus = null;
}

// Rendering. Drawing is limited to once per animation frame.
let startTime = null;
let frameCount = 0;
let currentTime = -1;
let previousImageData = null;

function CompareImages(imageData1: ImageData, imageData2: ImageData, width: number, height: number) {
  let diff = 0;
  for (let i = 0; i < width * height; i++) {
    let tmp = i*4
    let r1 = imageData1.data[tmp];
    let g1 = imageData1.data[tmp + 1];
    let b1 = imageData1.data[tmp + 2];
    let r2 = imageData2.data[tmp];
    let g2 = imageData2.data[tmp + 1];
    let b2 = imageData2.data[tmp + 2];
    let d = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
    if (d > 50) {
      diff++;
    }
    if (diff > 1000) {
      break;
    }
  }
  console.log(diff);
  return diff;
}

async function renderFrame(frame: VideoFrame, currentTime: number) {
  let canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
  let context = canvas.getContext("2d");
  context.drawImage(frame, 0, 0);
  let imageData = context.getImageData(0, 0, frame.displayWidth, frame.displayHeight);
  canvas.width = ThumbnailWidth;
  canvas.height = ThumbnailHeight;
  context.drawImage(frame, 0, 0, ThumbnailWidth, ThumbnailHeight);
  let thumbnail = await canvas.convertToBlob({type: "image/jpeg", quality: 0.5});
  let diff = 0;
  if (previousImageData) {
    // compare the current frame with the previous frame
    diff = CompareImages(previousImageData, imageData, frame.displayWidth, frame.displayHeight);
  }
  postMessage({"diff": diff, "time": currentTime, "thumbnail": thumbnail});
  previousImageData = imageData;
  frame.close();
}

// Startup.
async function start({dataUri}) {
  // Set up a VideoDecoder.
  const decoder = new VideoDecoder({
    output(frame) {
      if (Math.floor(frame.timestamp/1e6) <= currentTime) {
        frame.close();
        return;
      }
      // Update statistics.
      if (startTime == null) {
        startTime = performance.now();
      } else {
        const elapsed = (performance.now() - startTime) / 1000;
        const fps = ++frameCount / elapsed;
        setStatus("render", `${fps.toFixed(0)} fps`);
      }
      currentTime = Math.floor(frame.timestamp/1e6);
      renderFrame(frame, currentTime);
    },
    error(e) {
      setStatus("decode", e);
    }
  });

  // Fetch and demux the media data.
  const demuxer = new MP4Demuxer(dataUri, {
    onConfig(config) {
      setStatus("decode", `${config.codec} @ ${config.codedWidth}x${config.codedHeight}`);
      decoder.configure(config);
    },
    onChunk(chunk) {
      decoder.decode(chunk);
    },
    setStatus
  });
}

// Listen for the start request.
self.addEventListener("message", message =>start(message.data), {once: true});
