<template>
  <div
    class="screenshot-overlay"
    ref="overlayRef"
    @mousedown="startSelection"
    @mousemove="updateSelection"
    @mouseup="endSelection"
    @keydown.escape="cancelScreenshot"
    tabindex="0"
  >
    <!-- 全屏截图背景 -->
    <canvas ref="bgCanvas" class="bg-canvas"></canvas>

    <!-- 遮罩层（暗色区域） -->
    <canvas ref="maskCanvas" class="mask-canvas"></canvas>

    <!-- 选取工具栏 -->
    <div
      v-if="selectionDone"
      class="selection-toolbar"
      :style="toolbarStyle"
    >
      <el-button size="small" @click="cancelScreenshot">取消</el-button>
      <el-button size="small" type="primary" @click="confirmScreenshot">确认</el-button>
    </div>

    <!-- 尺寸提示 -->
    <div
      v-if="isSelecting || selectionDone"
      class="size-hint"
      :style="sizeHintStyle"
    >
      {{ Math.abs(selection.width) }} × {{ Math.abs(selection.height) }}
    </div>

    <div v-if="!backgroundReady" class="loading-hint">正在准备截图...</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const overlayRef = ref(null);
const bgCanvas = ref(null);
const maskCanvas = ref(null);

// 截图原始数据
const screenImage = ref(null);
const screenWidth = ref(0);
const screenHeight = ref(0);
const backgroundReady = ref(false);

// 选取状态
const isSelecting = ref(false);
const selectionDone = ref(false);
const selection = ref({ x: 0, y: 0, width: 0, height: 0 });
const startPoint = ref({ x: 0, y: 0 });

// 工具栏位置
const toolbarStyle = computed(() => {
  const s = normalizedSelection.value;
  return {
    position: 'fixed',
    left: `${s.x + s.width - 130}px`,
    top: `${s.y + s.height + 8}px`,
    zIndex: 10001,
  };
});

// 尺寸提示位置
const sizeHintStyle = computed(() => {
  const s = normalizedSelection.value;
  return {
    position: 'fixed',
    left: `${s.x}px`,
    top: `${s.y - 25}px`,
    zIndex: 10001,
  };
});

// 标准化选区（处理负宽高）
const normalizedSelection = computed(() => {
  const s = selection.value;
  return {
    x: s.width < 0 ? s.x + s.width : s.x,
    y: s.height < 0 ? s.y + s.height : s.y,
    width: Math.abs(s.width),
    height: Math.abs(s.height),
  };
});

onMounted(async () => {
  // 聚焦以接收键盘事件
  overlayRef.value?.focus();

  // 监听来自主进程的截图数据
  if (window.electronAPI) {
    window.electronAPI.screenshot.onData((data) => {
      applyScreenshotData(data);
    });
    window.electronAPI.screenshot.onReset?.(() => {
      resetSelection(true);
    });

    // 主动拉取一次，避免 did-finish-load 早于页面监听导致数据丢失
    try {
      const data = await window.electronAPI.screenshot.getData?.();
      applyScreenshotData(data);
    } catch (err) {
      console.error('获取截图数据失败:', err);
    }
  }

  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
});

function applyScreenshotData(data) {
  if (!data?.image) return;

  screenImage.value = data.image;
  screenWidth.value = data.width;
  screenHeight.value = data.height;
  resetSelection(false);
  backgroundReady.value = false;
  drawBackground();
  drawMask();
}

function handleResize() {
  drawBackground();
  drawMask();
}

function resetSelection(clearImage = false) {
  isSelecting.value = false;
  selectionDone.value = false;
  selection.value = { x: 0, y: 0, width: 0, height: 0 };
  startPoint.value = { x: 0, y: 0 };

  if (clearImage) {
    screenImage.value = null;
    backgroundReady.value = false;
    clearBackground();
  }

  drawMask();
}

/**
 * 绘制背景截图
 */
function drawBackground() {
  const canvas = bgCanvas.value;
  if (!canvas || !screenImage.value) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    backgroundReady.value = true;
  };
  img.src = screenImage.value;
}

function clearBackground() {
  const canvas = bgCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * 绘制遮罩层
 */
function drawMask() {
  const canvas = maskCanvas.value;
  if (!canvas) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 半透明黑色遮罩
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 挖出选区（透明）
  if (isSelecting.value || selectionDone.value) {
    const s = normalizedSelection.value;
    if (s.width > 0 && s.height > 0) {
      ctx.clearRect(s.x, s.y, s.width, s.height);

      // 选区边框
      ctx.strokeStyle = '#409eff';
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x, s.y, s.width, s.height);
    }
  }
}

function startSelection(e) {
  if (!backgroundReady.value) return;
  if (selectionDone.value) return;

  isSelecting.value = true;
  startPoint.value = { x: e.clientX, y: e.clientY };
  selection.value = { x: e.clientX, y: e.clientY, width: 0, height: 0 };
}

function updateSelection(e) {
  if (!isSelecting.value) return;

  selection.value = {
    x: startPoint.value.x,
    y: startPoint.value.y,
    width: e.clientX - startPoint.value.x,
    height: e.clientY - startPoint.value.y,
  };

  drawMask();
}

function endSelection(e) {
  if (!isSelecting.value) return;
  isSelecting.value = false;

  const s = normalizedSelection.value;
  if (s.width < 5 || s.height < 5) {
    // 选区太小，忽略
    selectionDone.value = false;
    return;
  }

  selectionDone.value = true;
}

function confirmScreenshot() {
  const s = normalizedSelection.value;

  // 从背景 canvas 裁剪选区
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = s.width;
  cropCanvas.height = s.height;

  const ctx = cropCanvas.getContext('2d');
  // 从背景 canvas 内容中裁剪
  ctx.drawImage(
    bgCanvas.value,
    s.x, s.y, s.width, s.height,
    0, 0, s.width, s.height
  );

  const imageDataUrl = cropCanvas.toDataURL('image/png');

  // 发送到主进程
  if (window.electronAPI) {
    window.electronAPI.screenshot.complete(imageDataUrl);
  }
}

function cancelScreenshot() {
  if (window.electronAPI) {
    window.electronAPI.screenshot.cancel();
  }
}
</script>

<style scoped>
.screenshot-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  cursor: crosshair;
  z-index: 10000;
  outline: none;
}

.bg-canvas,
.mask-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.mask-canvas {
  z-index: 1;
}

.selection-toolbar {
  background: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  display: flex;
  gap: 4px;
}

.size-hint {
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
}

.loading-hint {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10002;
  color: #fff;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
}
</style>
