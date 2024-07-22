importScripts("demuxer_mp4.js");

const ThumbnailHeight = 100;
const ThumbnailWidth = 160;

class Canvas2DRenderer {
  #canvas: HTMLCanvasElement = null;
  #ctx: CanvasRenderingContext2D = null;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext("2d");
  }

  draw(frame: VideoFrame) {
    this.#canvas.width = frame.displayWidth;
    this.#canvas.height = frame.displayHeight;
    this.#ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight);
  }
};

// Status UI. Messages are batched per animation frame.
let pendingStatus = null;

function setStatus(type, message) {
  if (pendingStatus) {
    pendingStatus[type] = message;
  } else {
    pendingStatus = {[type]: message};
    self.requestAnimationFrame(statusAnimationFrame);
  }
}

function statusAnimationFrame() {
  self.postMessage(pendingStatus);
  pendingStatus = null;
}

// Rendering. Drawing is limited to once per animation frame.
let renderer: Canvas2DRenderer = null;
let pendingFrame = null;
let startTime = null;
let frameCount = 0;
let currentTime = -1;

function renderFrame(frame, currentTime) {
  if (!pendingFrame) {
    // Schedule rendering in the next animation frame.
    requestAnimationFrame(renderAnimationFrame);
  } else {
    // Close the current pending frame before replacing it.
    pendingFrame.close();
  }
  // Set or replace the pending frame.
  pendingFrame = frame;
}

function renderAnimationFrame() {
  renderer.draw(pendingFrame);
  pendingFrame = null;
}

// Startup.
async function start({dataUri, canvas}) {
  renderer = new Canvas2DRenderer(canvas);

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
      setStatus("currentTime", currentTime);
      // Schedule the frame to be rendered.
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
