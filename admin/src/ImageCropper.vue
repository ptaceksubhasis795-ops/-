<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

type CropMode = "move" | "nw" | "ne" | "sw" | "se";
type Selection = { x: number; y: number; width: number; height: number };

const props = withDefaults(defineProps<{
  source: string;
  ratio: number;
  outputWidth: number;
  outputHeight: number;
  fileName?: string;
  ratioLabel?: string;
  description?: string;
}>(), { fileName: "裁剪图片.jpg", ratioLabel: "", description: "" });

const emit = defineEmits<{
  (event: "confirm", file: File, preview: string): void;
  (event: "cancel"): void;
}>();

const stage = ref<HTMLElement | null>(null);
const natural = ref({ width: 0, height: 0 });
const viewport = ref({ left: 0, top: 0, width: 0, height: 0, scale: 1 });
const selection = ref<Selection>({ x: 0, y: 0, width: 0, height: 0 });
const drag = ref<{ mode: CropMode; startX: number; startY: number; selection: Selection } | null>(null);
const sourceImage = ref<HTMLImageElement | null>(null);
const helpText = computed(() => props.description || `原图完整显示，裁剪框固定为 ${props.ratioLabel || `${Math.round(props.ratio * 100) / 100}:1`}，输出 ${props.outputWidth}×${props.outputHeight} 像素。`);

const viewportStyle = computed(() => ({ left: `${viewport.value.left}px`, top: `${viewport.value.top}px`, width: `${viewport.value.width}px`, height: `${viewport.value.height}px` }));
const selectionStyle = computed(() => ({ left: `${selection.value.x * viewport.value.scale}px`, top: `${selection.value.y * viewport.value.scale}px`, width: `${selection.value.width * viewport.value.scale}px`, height: `${selection.value.height * viewport.value.scale}px` }));
const maskStyle = computed(() => {
  const scale = viewport.value.scale;
  const left = selection.value.x * scale;
  const top = selection.value.y * scale;
  const right = viewport.value.width - (selection.value.x + selection.value.width) * scale;
  const bottom = viewport.value.height - (selection.value.y + selection.value.height) * scale;
  return {
    top: { left: "0", top: "0", width: "100%", height: `${Math.max(0, top)}px` },
    bottom: { left: "0", bottom: "0", width: "100%", height: `${Math.max(0, bottom)}px` },
    left: { left: "0", top: `${top}px`, width: `${Math.max(0, left)}px`, height: `${selection.value.height * scale}px` },
    right: { right: "0", top: `${top}px`, width: `${Math.max(0, right)}px`, height: `${selection.value.height * scale}px` },
  };
});

function initialSelection(width: number, height: number) {
  const cropWidth = Math.min(width, height * props.ratio);
  const cropHeight = cropWidth / props.ratio;
  selection.value = { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}

function updateViewport() {
  const element = stage.value;
  if (!element || !natural.value.width || !natural.value.height) return;
  const scale = Math.min(element.clientWidth / natural.value.width, element.clientHeight / natural.value.height);
  viewport.value = { left: (element.clientWidth - natural.value.width * scale) / 2, top: (element.clientHeight - natural.value.height * scale) / 2, width: natural.value.width * scale, height: natural.value.height * scale, scale };
}

function onImageLoad(event: Event) {
  const image = event.target as HTMLImageElement;
  sourceImage.value = image;
  natural.value = { width: image.naturalWidth, height: image.naturalHeight };
  initialSelection(image.naturalWidth, image.naturalHeight);
  nextTick(updateViewport);
}

function beginDrag(event: PointerEvent, mode: CropMode) {
  event.preventDefault();
  event.stopPropagation();
  stage.value?.setPointerCapture(event.pointerId);
  drag.value = { mode, startX: event.clientX, startY: event.clientY, selection: { ...selection.value } };
}

function moveDrag(event: PointerEvent) {
  const active = drag.value;
  const scale = viewport.value.scale;
  if (!active || !scale || !natural.value.width) return;
  const dx = (event.clientX - active.startX) / scale;
  const dy = (event.clientY - active.startY) / scale;
  const start = active.selection;
  const ratio = props.ratio;
  let width = start.width;
  let x = start.x;
  let y = start.y;
  if (active.mode === "move") {
    x = Math.min(Math.max(0, start.x + dx), natural.value.width - start.width);
    y = Math.min(Math.max(0, start.y + dy), natural.value.height - start.height);
  } else {
    const left = active.mode === "nw" || active.mode === "sw";
    const top = active.mode === "nw" || active.mode === "ne";
    const anchorX = left ? start.x + start.width : start.x;
    const anchorY = top ? start.y + start.height : start.y;
    const requestedWidth = left ? start.width - dx : start.width + dx;
    const minWidth = Math.min(start.width, Math.max(80, natural.value.width * 0.12));
    const maxWidth = Math.min(left ? anchorX : natural.value.width - anchorX, (top ? anchorY : natural.value.height - anchorY) * ratio);
    width = Math.min(Math.max(minWidth, requestedWidth), maxWidth);
    const height = width / ratio;
    x = left ? anchorX - width : anchorX;
    y = top ? anchorY - height : anchorY;
  }
  const height = width / ratio;
  selection.value = { x: Math.max(0, Math.min(x, natural.value.width - width)), y: Math.max(0, Math.min(y, natural.value.height - height)), width, height };
}

function endDrag(event: PointerEvent) {
  if (drag.value && stage.value?.hasPointerCapture(event.pointerId)) stage.value.releasePointerCapture(event.pointerId);
  drag.value = null;
}

function confirm() {
  const image = sourceImage.value;
  if (!image || !selection.value.width || !selection.value.height) return;
  const canvas = document.createElement("canvas");
  canvas.width = props.outputWidth;
  canvas.height = props.outputHeight;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.drawImage(image, Math.round(selection.value.x), Math.round(selection.value.y), Math.round(selection.value.width), Math.round(selection.value.height), 0, 0, props.outputWidth, props.outputHeight);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], props.fileName || "裁剪图片.jpg", { type: "image/jpeg" });
    emit("confirm", file, canvas.toDataURL("image/jpeg", 0.88));
  }, "image/jpeg", 0.88);
}

watch(() => props.source, () => nextTick(updateViewport));
onMounted(() => window.addEventListener("resize", updateViewport));
onUnmounted(() => window.removeEventListener("resize", updateViewport));
</script>

<template>
  <div class="cropper-dialog">
    <div class="cropper-head"><div><p class="panel-kicker">图片裁剪</p><h2>调整图片比例</h2></div><button class="icon-button" type="button" @click="emit('cancel')">×</button></div>
    <div ref="stage" class="cropper-stage" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag">
      <img class="cropper-source" :style="viewportStyle" :src="source" alt="待裁剪图片" @load="onImageLoad" />
      <div v-if="natural.width" class="cropper-viewport" :style="viewportStyle">
        <div class="cropper-mask" :style="maskStyle.top"></div><div class="cropper-mask" :style="maskStyle.bottom"></div><div class="cropper-mask" :style="maskStyle.left"></div><div class="cropper-mask" :style="maskStyle.right"></div>
        <div class="cropper-selection" :style="selectionStyle" @pointerdown="beginDrag($event, 'move')"><span class="cropper-handle cropper-handle-nw" @pointerdown.stop="beginDrag($event, 'nw')"></span><span class="cropper-handle cropper-handle-ne" @pointerdown.stop="beginDrag($event, 'ne')"></span><span class="cropper-handle cropper-handle-sw" @pointerdown.stop="beginDrag($event, 'sw')"></span><span class="cropper-handle cropper-handle-se" @pointerdown.stop="beginDrag($event, 'se')"></span></div>
      </div>
    </div>
    <p class="cropper-help">{{ helpText }}</p>
    <div class="cropper-actions"><button class="ghost-button" type="button" @click="emit('cancel')">取消</button><button class="primary-small" type="button" @click="confirm">确认裁剪</button></div>
  </div>
</template>

<style scoped>
.cropper-dialog { width: min(760px, 100%); padding: 24px; border: 1px solid #d5e4df; border-radius: 16px; background: #f9fcfa; box-shadow: 0 24px 60px rgba(13,52,53,.2); }.cropper-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }.cropper-head h2 { margin-top: 7px; color: #234342; font-family: "Noto Serif SC", serif; font-size: 20px; }.cropper-stage { position: relative; width: 100%; height: min(62vh, 520px); min-height: 300px; overflow: hidden; border: 2px solid #0f766e; border-radius: 12px; background: #263b3a; user-select: none; touch-action: none; }.cropper-source, .cropper-viewport { position: absolute; }.cropper-source { pointer-events: none; }.cropper-viewport { overflow: visible; pointer-events: none; }.cropper-mask { position: absolute; z-index: 2; background: rgba(18,28,27,.58); pointer-events: none; }.cropper-selection { position: absolute; z-index: 3; box-sizing: border-box; border: 2px dashed #fff; outline: 1px solid rgba(15,118,110,.85); cursor: move; pointer-events: auto; touch-action: none; }.cropper-handle { position: absolute; width: 16px; height: 16px; box-sizing: border-box; border: 2px solid #0f766e; border-radius: 4px; background: #fff; pointer-events: auto; touch-action: none; }.cropper-handle-nw { top: -8px; left: -8px; cursor: nwse-resize; }.cropper-handle-ne { top: -8px; right: -8px; cursor: nesw-resize; }.cropper-handle-sw { bottom: -8px; left: -8px; cursor: nesw-resize; }.cropper-handle-se { right: -8px; bottom: -8px; cursor: nwse-resize; }.cropper-help { margin-top: 10px; color: #809995; font-size: 10px; line-height: 1.6; }.cropper-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 17px; }
</style>
