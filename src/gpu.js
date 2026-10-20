// WebGPU renderer: Mars, the debris and the vortex into a half-float
// picture, then src/shaders/post.wgsl onto the screen. src/gl.js draws the
// same frame with WebGL 2.
import particlesCode from './shaders/particles.wgsl?raw';
import debrisCode from './shaders/debris.wgsl?raw';
import marsCode from './shaders/mars.wgsl?raw';
import postCode from './shaders/post.wgsl?raw';
import { SIZES } from './frame.js';

const HDR = 'rgba16float';
const DEPTH = 'depth24plus';

export async function createWebGPU(canvas, meshes) {
  if (!navigator.gpu) throw new Error('This browser does not support WebGPU.');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter is available on this device.');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('This canvas has no WebGPU context.');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  async function shader(name, code) {
    const module = device.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter(m => m.type === 'error');
    if (errors.length) throw new Error(errors.map(m => `${name}:${m.lineNum}: ${m.message}`).join('\n'));
    return module;
  }
  const [mParticles, mDebris, mMars, mPost] = await Promise.all([
    shader('particles.wgsl', particlesCode), shader('debris.wgsl', debrisCode),
    shader('mars.wgsl', marsCode), shader('post.wgsl', postCode),
  ]);

  const add = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
  const marsPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: mMars, entryPoint: 'vs' },
    fragment: { module: mMars, entryPoint: 'fs', targets: [{ format: HDR }] },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'always' },
  });
  const debrisPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: mDebris, entryPoint: 'vs',
      buffers: [{
        arrayStride: 24,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
        ],
      }],
    },
    fragment: { module: mDebris, entryPoint: 'fs', targets: [{ format: HDR }] },
    depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less' },
  });
  const particlePipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: mParticles, entryPoint: 'vs' },
    fragment: { module: mParticles, entryPoint: 'fs', targets: [{ format: HDR, blend: { color: add, alpha: add } }] },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less' },
  });
  const postPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: mPost, entryPoint: 'vs' },
    fragment: { module: mPost, entryPoint: 'fs', targets: [{ format }] },
  });

  const ubuf = size => device.createBuffer({ size: size * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const buf = {
    particles: ubuf(SIZES.particles), debris: ubuf(SIZES.debris), inst: ubuf(SIZES.inst),
    mars: ubuf(SIZES.mars), post: ubuf(SIZES.post),
  };
  const vbuf = device.createBuffer({ size: meshes.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(vbuf, 0, meshes.data);

  const group = (pipe, entries) => device.createBindGroup({
    layout: pipe.getBindGroupLayout(0),
    entries: entries.map((resource, binding) => ({ binding, resource })),
  });
  const marsGroup = group(marsPipe, [{ buffer: buf.mars }]);
  const debrisGroup = group(debrisPipe, [{ buffer: buf.debris }, { buffer: buf.inst }]);
  const particleGroup = group(particlePipe, [{ buffer: buf.particles }]);

  let hdr = null, depth = null, postGroup = null, size = [0, 0];
  function targets(w, h) {
    if (size[0] === w && size[1] === h) return;
    size = [w, h];
    hdr?.destroy(); depth?.destroy();
    hdr = device.createTexture({ size: [w, h], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    depth = device.createTexture({ size: [w, h], format: DEPTH, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    postGroup = group(postPipe, [{ buffer: buf.post }, hdr.createView()]);
  }

  return {
    kind: 'webgpu',
    draw(f) {
      targets(canvas.width, canvas.height);
      const q = device.queue;
      q.writeBuffer(buf.particles, 0, f.particles);
      q.writeBuffer(buf.debris, 0, f.debris);
      q.writeBuffer(buf.inst, 0, f.inst);
      q.writeBuffer(buf.mars, 0, f.mars);
      q.writeBuffer(buf.post, 0, f.post);

      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: hdr.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
        depthStencilAttachment: { view: depth.createView(), depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 1 },
      });
      pass.setPipeline(marsPipe);
      pass.setBindGroup(0, marsGroup);
      pass.draw(3);
      if (f.groups.length) {
        pass.setPipeline(debrisPipe);
        pass.setBindGroup(0, debrisGroup);
        pass.setVertexBuffer(0, vbuf);
        for (const g of f.groups) {
          const r = meshes.ranges[g.mesh];
          pass.draw(r.count, g.count, r.first, g.first);
        }
      }
      pass.setPipeline(particlePipe);
      pass.setBindGroup(0, particleGroup);
      pass.draw(6, f.count);
      pass.end();

      const post = enc.beginRenderPass({
        colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      });
      post.setPipeline(postPipe);
      post.setBindGroup(0, postGroup);
      post.draw(3);
      post.end();
      q.submit([enc.finish()]);
    },
  };
}
