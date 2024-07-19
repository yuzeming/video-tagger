importScripts("demuxer_mp4.js");


class WebGLRenderer {
  #canvas: OffscreenCanvas = null;
  #ctx: WebGL2RenderingContext = null;

  static vertexShaderSource = `
    attribute vec2 xy;

    varying highp vec2 uv;

    void main(void) {
      gl_Position = vec4(xy, 0.0, 1.0);
      // Map vertex coordinates (-1 to +1) to UV coordinates (0 to 1).
      // UV coordinates are Y-flipped relative to vertex coordinates.
      uv = vec2((1.0 + xy.x) / 2.0, (1.0 - xy.y) / 2.0);
    }
  `;

  static fragmentShaderSource = `
    varying highp vec2 uv;

    uniform sampler2D texture;

    void main(void) {
      gl_FragColor = texture2D(texture, uv);
    }
  `;

  constructor(canvas: OffscreenCanvas) {
    this.#canvas = canvas;
    const gl = this.#ctx = canvas.getContext("webgl2");

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, WebGLRenderer.vertexShaderSource);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      throw gl.getShaderInfoLog(vertexShader);
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, WebGLRenderer.fragmentShaderSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      throw gl.getShaderInfoLog(fragmentShader);
    }

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram (shaderProgram );
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      throw gl.getProgramInfoLog(shaderProgram);
    }
    gl.useProgram(shaderProgram);

    // Vertex coordinates, clockwise from bottom-left.
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0,
      -1.0, +1.0,
      +1.0, +1.0,
      +1.0, -1.0
    ]), gl.STATIC_DRAW);

    const xyLocation = gl.getAttribLocation(shaderProgram, "xy");
    gl.vertexAttribPointer(xyLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(xyLocation);

    // Create one texture to upload frames to.
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  draw(frame) {
    this.#canvas.width = frame.displayWidth;
    this.#canvas.height = frame.displayHeight;

    const gl = this.#ctx;
  
    // Upload the frame.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    frame.close();

    // Configure and clear the drawing area.
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(1.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Draw the frame.
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
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
let renderer: WebGLRenderer = null;
let pendingFrame = null;
let startTime = null;
let frameCount = 0;
let currentTime = -1;

function renderFrame(frame) {
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
function start({dataUri, canvas}) {
  renderer = new WebGLRenderer(canvas);

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
      renderFrame(frame);
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
self.addEventListener("message", message => start(message.data), {once: true});
