<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Eye, Search, Save, X } from "lucide-vue-next";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import categories from "../../config/article-categories.json";
import clinicServiceCover from "../../assets/articles/generated/clinic-service.webp";
import dailyHealthCover from "../../assets/articles/generated/daily-health.webp";
import foodOriginCover from "../../assets/articles/generated/food-origin.webp";
import memberSharingCover from "../../assets/articles/generated/member-sharing.webp";
import nutritionCover from "../../assets/articles/generated/nutrition.webp";
import prescriptionGuideCover from "../../assets/articles/generated/prescription-guide.webp";
import serviceGuideCover from "../../assets/articles/generated/service-guide.webp";
import { getAdminArticleDetail, getProductDetail, saveArticle, searchAdminProducts, uploadFile } from "./api";
import ImageCropper from "./ImageCropper.vue";

const props = defineProps<{ articleId?: string }>();
const router = useRouter();
const isEditing = computed(() => Boolean(props.articleId));
const pageTitle = computed(() => isEditing.value ? "编辑科普文章" : "新增科普文章");
const articleForm = ref({ id: "", title: "", category: "daily-health", summary: "", body: "", published: true, recommended: false, productIds: [] as string[], jumpToShop: false, jumpTarget: "", coverMode: "system", coverKey: "/assets/articles/generated/daily-health.webp", coverWidth: 1280, coverHeight: 720, coverImage: "" });
const selectedProducts = ref<Record<string, any>>({});
const productRows = ref<any[]>([]);
const productKeyword = ref("");
const productCategory = ref("all");
const productPage = ref(1);
const productPageSize = 8;
const productTotal = ref(0);
const productLoading = ref(false);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const notice = ref("");
const dirty = ref(false);
const ready = ref(false);
const coverCropDialog = ref(false); const coverCropSource = ref(""); const coverCropName = ref(""); const coverUploading = ref(false); const coverDragActive = ref(false);
let searchTimer: number | undefined;
let loadSequence = 0;

const isPrescriptionCategory = computed(() => ["prescription-guide", "clinic-service"].includes(articleForm.value.category));
const selectedList = computed(() => articleForm.value.productIds.map((id) => selectedProducts.value[id]).filter(Boolean));
const hasNextProductPage = computed(() => productPage.value * productPageSize < productTotal.value);
const canSave = computed(() => Boolean(articleForm.value.title.trim() && articleForm.value.category && articleForm.value.body.trim() && !saving.value));
const coverAssets: Record<string, string> = { "clinic-service": clinicServiceCover, "daily-health": dailyHealthCover, "food-origin": foodOriginCover, "member-sharing": memberSharingCover, nutrition: nutritionCover, "prescription-guide": prescriptionGuideCover, "service-guide": serviceGuideCover };
const categoryMeta = computed(() => { const item = categories.find((category) => category.key === articleForm.value.category) || categories[0]; return { ...item, image: coverAssets[item.key] || item.image }; });
const coverOptions = computed(() => categories.map((item) => ({ key: item.key, name: item.name, coverKey: item.image, image: coverAssets[item.key] || item.image })));
const coverPreview = computed(() => { if (articleForm.value.coverMode === "system") return coverOptions.value.find((item) => item.coverKey === articleForm.value.coverKey)?.image || categoryMeta.value.image; return articleForm.value.coverImage || ""; });

function toast(message: string) { notice.value = message; window.setTimeout(() => { notice.value = ""; }, 2800); }
function resetForm() { articleForm.value = { id: "", title: "", category: "daily-health", summary: "", body: "", published: true, recommended: false, productIds: [], jumpToShop: false, jumpTarget: "", coverMode: "system", coverKey: "/assets/articles/generated/daily-health.webp", coverWidth: 1280, coverHeight: 720, coverImage: coverAssets["daily-health"] }; selectedProducts.value = {}; }

function selectSystemCover(option: { image: string; coverKey: string }) { articleForm.value.coverMode = "system"; articleForm.value.coverKey = option.coverKey; articleForm.value.coverImage = option.image; articleForm.value.coverWidth = 1280; articleForm.value.coverHeight = 720; }
function syncCategoryCover() { if (articleForm.value.coverMode === "system") { const option = coverOptions.value.find((item) => item.key === articleForm.value.category) || coverOptions.value[0]; if (option) selectSystemCover(option); } }
function processCoverFile(file?: File) { if (!file) return; if (!file.type.startsWith("image/")) return toast("请选择图片文件"); if (file.size > 8 * 1024 * 1024) return toast("图片不能超过 8MB"); coverCropName.value = file.name; const reader = new FileReader(); reader.onload = () => { coverCropSource.value = String(reader.result || ""); coverCropDialog.value = true; }; reader.readAsDataURL(file); }
function chooseCoverFile(event: Event) { processCoverFile((event.target as HTMLInputElement).files?.[0]); }
function coverDragOver(event: DragEvent) { event.preventDefault(); coverDragActive.value = true; }
function coverDragLeave(event: DragEvent) { event.preventDefault(); coverDragActive.value = false; }
function dropCoverFile(event: DragEvent) { event.preventDefault(); coverDragActive.value = false; processCoverFile(event.dataTransfer?.files?.[0]); }
async function confirmCoverCrop(file: File, preview: string) { coverUploading.value = true; try { const result = await uploadFile(file, "article-cover"); articleForm.value.coverMode = "custom"; articleForm.value.coverKey = result.fileKey; articleForm.value.coverWidth = 1280; articleForm.value.coverHeight = 720; articleForm.value.coverImage = preview; coverCropDialog.value = false; toast("文章封面已裁剪并上传"); } catch (error: any) { toast(error?.message || "文章封面上传失败"); } finally { coverUploading.value = false; } }

async function loadProductPage(page = 1) {
  const sequence = ++loadSequence;
  productLoading.value = true;
  try {
    const result = await searchAdminProducts({ keyword: productKeyword.value.trim(), category: productCategory.value, active: "true", page, pageSize: productPageSize });
    if (sequence !== loadSequence) return;
    productRows.value = result.items || [];
    productTotal.value = Number(result.total || 0);
    productPage.value = Number(result.page || page);
  } catch (error: any) {
    if (sequence === loadSequence) toast(error?.message || "商品搜索失败");
  } finally {
    if (sequence === loadSequence) productLoading.value = false;
  }
}

function scheduleProductSearch() {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => loadProductPage(1), 300);
}

function toggleProduct(product: any) {
  const id = String(product.id);
  const selected = new Set(articleForm.value.productIds);
  if (selected.has(id)) {
    selected.delete(id);
    delete selectedProducts.value[id];
  } else {
    selected.add(id);
    selectedProducts.value[id] = product;
  }
  articleForm.value.productIds = Array.from(selected);
}

function removeProduct(id: string) {
  articleForm.value.productIds = articleForm.value.productIds.filter((item) => item !== id);
  delete selectedProducts.value[id];
}

async function loadSelectedProducts(ids: string[]) {
  const rows = await Promise.all(ids.map(async (id) => {
    try { return await getProductDetail(id); } catch { return null; }
  }));
  const next: Record<string, any> = {};
  rows.filter(Boolean).forEach((row: any) => { next[String(row.id)] = row; });
  selectedProducts.value = next;
}

async function loadEditor() {
  loading.value = true;
  errorMessage.value = "";
  dirty.value = false;
  try {
    resetForm();
    if (props.articleId) {
      const article: any = await getAdminArticleDetail(props.articleId);
      articleForm.value = {
        id: article.id,
        title: article.title || "",
        category: article.category || article.tag || "daily-health",
        summary: article.summary || "",
        body: article.body || "",
        published: article.published !== false,
        recommended: Boolean(article.recommended),
        productIds: Array.isArray(article.productIds) ? article.productIds.map(String) : [],
        jumpToShop: Boolean(article.jumpToShop),
        jumpTarget: article.jumpTarget || "",
        coverMode: article.coverMode || "system",
        coverKey: article.coverKey || categories.find((item) => item.key === (article.category || article.tag))?.image || categories[0].image,
        coverWidth: Number(article.coverWidth || 1280),
        coverHeight: Number(article.coverHeight || 720),
        coverImage: article.coverMode === "custom" ? (article.coverImage || "") : (coverAssets[article.category || article.tag] || categories.find((item) => item.key === (article.category || article.tag))?.image || coverAssets["daily-health"]),
      };
      await loadSelectedProducts(articleForm.value.productIds);
    }
    await loadProductPage(1);
    ready.value = true;
  } catch (error: any) {
    errorMessage.value = error?.message || "文章加载失败";
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!articleForm.value.title.trim()) return toast("请填写文章标题");
  if (!articleForm.value.body.trim()) return toast("请填写文章正文");
  if (!articleForm.value.category) return toast("请选择文章分类");
  if (articleForm.value.recommended && !articleForm.value.published) return toast("草稿文章不能设置首页推荐");
  saving.value = true;
  try {
    const { coverImage: _coverPreview, ...articlePayload } = articleForm.value;
    await saveArticle({ ...articlePayload, tag: articleForm.value.category, productIds: Array.from(new Set(articleForm.value.productIds)) });
    dirty.value = false;
    toast("文章已保存");
    window.setTimeout(() => router.push("/content/articles"), 250);
  } catch (error: any) {
    toast(error?.message || "文章保存失败");
  } finally {
    saving.value = false;
  }
}

function goBack() {
  if (dirty.value && !window.confirm("当前文章还有未保存内容，确定离开吗？")) return;
  router.push("/content/articles");
}

watch(() => props.articleId, loadEditor);
watch(() => articleForm.value.category, syncCategoryCover);
watch(articleForm, () => { if (ready.value) dirty.value = true; }, { deep: true });
watch(() => articleForm.value.productIds, () => { if (ready.value) dirty.value = true; }, { deep: true });
onMounted(loadEditor);
onUnmounted(() => { if (searchTimer) window.clearTimeout(searchTimer); });
onBeforeRouteLeave(() => {
  if (!dirty.value || window.confirm("当前文章还有未保存内容，确定离开吗？")) return true;
  return false;
});
</script>

<template>
  <section class="article-editor-page">
    <div v-if="notice" class="toast article-editor-toast">{{ notice }}</div>
    <div class="article-editor-head">
      <div><button class="back-button" type="button" @click="goBack"><ArrowLeft :size="16" />返回文章列表</button><p class="eyebrow">内容管理 / 科普文章</p><h1>{{ pageTitle }}</h1><p class="article-editor-subtitle">完善内容、发布状态和商品跳转，保存后立即同步到小程序。</p></div>
      <div class="article-editor-actions"><button class="ghost-button" type="button" @click="goBack">取消</button><button class="primary-small" type="button" :disabled="!canSave" @click="save"><Save :size="15" />{{ saving ? "保存中" : "保存文章" }}</button></div>
    </div>

    <div v-if="loading" class="editor-state">正在加载文章编辑页…</div>
    <div v-else-if="errorMessage" class="editor-state error-state">{{ errorMessage }}<button class="ghost-button" type="button" @click="loadEditor">重新加载</button></div>
    <div v-else class="article-editor-grid">
      <form class="article-editor-form" @submit.prevent="save">
        <section class="editor-section cover-section"><div class="editor-section-title"><div><span class="section-number">04</span><h2>封面设置</h2></div><span>16:9 / 1280×720</span></div><div class="cover-mode-tabs"><button type="button" :class="{ active: articleForm.coverMode === 'system' }" @click="syncCategoryCover">系统封面</button><button type="button" :class="{ active: articleForm.coverMode === 'custom' }" @click="articleForm.coverMode = 'custom'">自定义上传</button></div><div v-if="articleForm.coverMode === 'system'" class="cover-options"><button v-for="option in coverOptions" :key="option.key" type="button" class="cover-option" :class="{ selected: articleForm.coverKey === option.coverKey }" @click="selectSystemCover(option)"><img :src="option.image" :alt="option.name" /><span>{{ option.name }}</span></button></div><label v-else class="upload-drop-zone cover-upload-zone" :class="{ 'is-dragging': coverDragActive }" @dragover="coverDragOver" @dragleave="coverDragLeave" @drop="dropCoverFile"><span class="upload-drop-title">拖入文章封面图片</span><span class="upload-drop-subtitle">或点击选择图片，裁剪比例 16:9，输出 1280×720，不能超过 8MB</span><input class="upload-drop-input" type="file" accept="image/png,image/jpeg,image/webp" @change="chooseCoverFile" /><span v-if="articleForm.coverMode === 'custom' && articleForm.coverKey" class="selected-file">已完成裁剪：{{ coverCropName || '自定义封面' }}</span></label></section>
        <section class="editor-section"><div class="editor-section-title"><div><span class="section-number">01</span><h2>基础信息</h2></div><span>文章内容</span></div><label>文章标题<input v-model="articleForm.title" maxlength="180" required placeholder="请输入清晰、易懂的文章标题" /><small>{{ articleForm.title.length }}/180</small></label><div class="editor-two-col"><label>文章分类<select v-model="articleForm.category" required><option v-for="category in categories" :key="category.key" :value="category.key">{{ category.name }}</option></select></label><label>摘要<input v-model="articleForm.summary" maxlength="200" placeholder="用于列表、分享和搜索结果的简短摘要" /><small>{{ articleForm.summary.length }}/200</small></label></div><label>文章正文<textarea v-model="articleForm.body" rows="18" required placeholder="请输入科普文章正文，建议分段书写，方便老年用户阅读。"></textarea><small>{{ articleForm.body.length }} 字</small></label></section>

        <section class="editor-section"><div class="editor-section-title"><div><span class="section-number">02</span><h2>发布设置</h2></div><span>小程序展示</span></div><div class="editor-switches"><label class="switch-row"><input v-model="articleForm.published" type="checkbox" /><span><b>发布到小程序</b><small>关闭后保存为草稿，仅后台可见。</small></span></label><label class="switch-row"><input v-model="articleForm.recommended" type="checkbox" :disabled="!articleForm.published" /><span><b>首页推荐文章</b><small>{{ articleForm.published ? "出现在首页推荐区域。" : "发布后才可以设置推荐。" }}</small></span></label></div></section>

        <section class="editor-section"><div class="editor-section-title"><div><span class="section-number">03</span><h2>商品与跳转</h2></div><span>{{ articleForm.productIds.length }} 个已选商品</span></div><div v-if="selectedList.length" class="selected-product-list"><div v-for="product in selectedList" :key="product.id" class="selected-product-chip"><span><b>{{ product.name }}</b><small>{{ product.category === "prescription" ? "处方饮片" : "药食同源" }} · {{ product.priceFen ? `¥${(Number(product.priceFen) / 100).toFixed(2)}` : "价格待确认" }}</small></span><button type="button" title="移除商品" @click="removeProduct(product.id)"><X :size="14" /></button></div><button class="text-button clear-selected" type="button" @click="articleForm.productIds = []; selectedProducts = {}">清空已选</button></div><div v-else class="selected-product-empty">还没有绑定商品。绑定后，文章末尾会优先显示商品详情入口。</div><div class="product-picker"><div class="product-picker-toolbar"><label class="product-search"><Search :size="15" /><input v-model="productKeyword" placeholder="搜索商品名称或编号" @input="scheduleProductSearch" /></label><select v-model="productCategory" @change="loadProductPage(1)"><option value="all">全部分类</option><option value="daily">药食同源</option><option value="prescription">处方饮片</option></select></div><div v-if="productLoading" class="picker-state">正在搜索商品…</div><div v-else-if="!productRows.length" class="picker-state">没有找到匹配商品。</div><div v-else class="product-picker-list"><button v-for="product in productRows" :key="product.id" type="button" class="product-picker-card" :class="{ selected: articleForm.productIds.includes(product.id) }" @click="toggleProduct(product)"><span class="picker-check"><Check v-if="articleForm.productIds.includes(product.id)" :size="14" /></span><span class="picker-product-main"><b>{{ product.name }}</b><small>{{ product.id }} · {{ product.category === "prescription" ? "处方饮片" : "药食同源" }}</small></span><span class="picker-product-meta"><b>¥{{ Number(product.price || 0).toFixed(2) }}</b><small>{{ product.stock }} 件</small></span></button></div><div class="product-picker-footer"><span>共 {{ productTotal }} 个商品</span><div><button type="button" class="icon-button" :disabled="productPage <= 1" title="上一页" @click="loadProductPage(productPage - 1)"><ChevronLeft :size="16" /></button><span>第 {{ productPage }} 页</span><button type="button" class="icon-button" :disabled="!hasNextProductPage" title="下一页" @click="loadProductPage(productPage + 1)"><ChevronRight :size="16" /></button></div></div></div><div class="jump-summary"><b>文章末尾跳转</b><span v-if="articleForm.productIds.length">将优先跳转第一个绑定商品：{{ selectedList[0]?.name || "已选商品" }}</span><span v-else-if="articleForm.jumpToShop">将跳转商城首页</span><span v-else-if="isPrescriptionCategory">当前分类默认跳转处方服务</span><span v-else>保留分享和继续阅读，不增加商品跳转</span></div><label class="switch-row compact-switch"><input v-model="articleForm.jumpToShop" type="checkbox" :disabled="articleForm.productIds.length > 0" /><span><b>文章末尾显示“进入商城”</b><small>绑定商品后以商品详情为优先。</small></span></label></section>

        <section class="editor-checklist"><b>保存前检查</b><span :class="{ done: articleForm.title.trim() }">{{ articleForm.title.trim() ? "✓" : "○" }} 已填写标题</span><span :class="{ done: articleForm.body.trim() }">{{ articleForm.body.trim() ? "✓" : "○" }} 已填写正文</span><span :class="{ done: articleForm.published || !articleForm.recommended }">{{ articleForm.recommended && !articleForm.published ? "○ 推荐文章必须先发布" : "✓ 发布设置有效" }}</span></section>
      </form>

      <aside class="article-preview-panel"><div class="preview-panel-head"><span><Eye :size="15" />小程序预览</span><em>{{ categoryMeta.name }}</em></div><article class="article-live-preview" :class="`preview-${categoryMeta.theme}`"><div class="preview-cover"><img :src="coverPreview" alt="文章封面预览" /><span>{{ categoryMeta.shortName }}</span></div><div class="preview-content"><p>{{ categoryMeta.name }}</p><h2>{{ articleForm.title || "文章标题预览" }}</h2><div class="preview-summary">{{ articleForm.summary || "文章摘要会显示在这里。" }}</div><div class="preview-body">{{ articleForm.body || "文章正文预览会显示在这里，方便检查段落和阅读长度。" }}</div><div class="preview-footer"><span>{{ articleForm.productIds.length ? "商品详情入口" : articleForm.jumpToShop ? "进入商城" : "继续阅读" }}</span><ChevronRight :size="14" /></div></div></article></aside>
      <div v-if="coverCropDialog" class="dialog-backdrop crop-backdrop"><ImageCropper :source="coverCropSource" :ratio="16 / 9" :output-width="1280" :output-height="720" :file-name="coverCropName || '文章封面.jpg'" ratio-label="16:9" description="文章封面固定为 16:9，建议尺寸 1280×720 像素。" @confirm="confirmCoverCrop" @cancel="coverCropDialog = false" /></div>
    </div>
  </section>
</template>

<style scoped>
.article-editor-page { max-width: 1520px; margin: 0 auto; padding: 34px 44px 64px; }
.article-editor-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 26px; }
.back-button { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 18px; background: transparent; color: #4d8a80; font-size: 11px; }
.article-editor-head h1 { margin-top: 8px; color: #173b3c; font-family: "Noto Serif SC", serif; font-size: 30px; }
.article-editor-subtitle { margin-top: 9px; color: #77908e; font-size: 12px; }
.article-editor-actions { display: flex; gap: 10px; }
.article-editor-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, .65fr); align-items: start; gap: 18px; }
.article-editor-form { display: flex; flex-direction: column; gap: 16px; }
.editor-section, .article-preview-panel, .editor-checklist { border: 1px solid #dce7e4; border-radius: 14px; background: #f9fcfa; }
.editor-section { padding: 22px; }
.editor-section-title { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 17px; color: #91a5a1; font-size: 10px; }
.editor-section-title > div { display: flex; align-items: center; gap: 9px; }
.editor-section-title h2 { color: #234342; font-family: "Noto Serif SC", serif; font-size: 18px; }
.section-number { color: #bb8a53; font-size: 10px; letter-spacing: .1em; }
.editor-section label { display: flex; flex-direction: column; gap: 7px; margin-top: 13px; color: #5d7874; font-size: 11px; }
.editor-section input, .editor-section select, .editor-section textarea { width: 100%; border: 1px solid #d3e2de; border-radius: 8px; outline: none; background: #fff; color: #315451; font-size: 12px; }
.editor-section input, .editor-section select { min-height: 40px; padding: 9px 10px; }
.editor-section textarea { min-height: 290px; padding: 12px; line-height: 1.7; resize: vertical; }
.editor-section input:focus, .editor-section select:focus, .editor-section textarea:focus { border-color: #5ba69b; box-shadow: 0 0 0 3px rgba(91,166,155,.12); }
.editor-section label > small { align-self: flex-end; color: #9aadaa; font-size: 9px; }
.editor-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.editor-switches { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.switch-row { display: flex !important; flex-direction: row !important; align-items: flex-start; gap: 10px; margin: 0 !important; padding: 13px; border: 1px solid #e1ebe8; border-radius: 10px; background: #fff; }
.switch-row input { width: 16px; min-height: 16px; margin-top: 2px; accent-color: #0f766e; }
.switch-row span { display: flex; flex-direction: column; gap: 4px; }
.switch-row b { color: #385854; font-size: 11px; }.switch-row small { color: #91a5a1; font-size: 9px; line-height: 1.5; }
.selected-product-list { display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch; }
.selected-product-chip { display: flex; align-items: center; gap: 9px; min-width: 190px; padding: 9px 10px; border: 1px solid #a8d3c8; border-radius: 9px; background: #e8f5f1; }
.selected-product-chip > span { display: flex; flex: 1; flex-direction: column; gap: 3px; min-width: 0; }.selected-product-chip b { overflow: hidden; color: #2c6c64; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.selected-product-chip small { color: #6e948e; font-size: 9px; }.selected-product-chip button { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 7px; background: transparent; color: #4d8a80; }.clear-selected { align-self: center; }
.selected-product-empty { padding: 13px; border: 1px dashed #cbdcd7; border-radius: 9px; color: #91a5a1; font-size: 10px; }
.product-picker { margin-top: 14px; padding: 13px; border: 1px solid #e0ebe8; border-radius: 11px; background: #fff; }.product-picker-toolbar { display: flex; gap: 8px; }.product-picker-toolbar select { width: 120px; flex: none; }.product-search { display: flex !important; flex: 1; flex-direction: row !important; align-items: center; gap: 6px !important; margin: 0 !important; padding: 0 9px; border: 1px solid #d3e2de; border-radius: 8px; }.product-search input { min-height: 34px; padding: 7px 0; border: 0; }.product-picker-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }.product-picker-card { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 10px; border: 1px solid #e2ebe8; border-radius: 9px; background: #fbfdfc; color: #4b6b67; text-align: left; }.product-picker-card:hover, .product-picker-card.selected { border-color: #7bbcb0; background: #eef8f5; }.picker-check { display: grid; width: 20px; height: 20px; flex: none; place-items: center; border: 1px solid #b8d8d1; border-radius: 6px; color: #fff; }.selected .picker-check { border-color: #0f766e; background: #0f766e; }.picker-product-main { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }.picker-product-main b { overflow: hidden; color: #385854; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.picker-product-main small, .picker-product-meta small { color: #93a5a3; font-size: 8px; }.picker-product-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }.picker-product-meta b { color: #4d837a; font-size: 10px; }.picker-state { padding: 28px 0; color: #91a5a1; font-size: 10px; text-align: center; }.product-picker-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; color: #91a5a1; font-size: 9px; }.product-picker-footer > div { display: flex; align-items: center; gap: 6px; }.product-picker-footer .icon-button { width: 26px; height: 26px; border: 1px solid #d3e2de; }
.jump-summary { display: flex; flex-direction: column; gap: 5px; margin-top: 13px; padding: 11px 12px; border-radius: 8px; background: #f1f7f4; color: #6f8885; font-size: 10px; }.jump-summary b { color: #38645e; }
.compact-switch { margin-top: 12px !important; padding: 0 !important; border: 0 !important; background: transparent !important; }
.editor-checklist { display: flex; align-items: center; gap: 16px; padding: 13px 16px; color: #92a4a1; font-size: 10px; }.editor-checklist b { color: #527570; }.editor-checklist span.done { color: #348172; }
.article-preview-panel { position: sticky; top: 20px; overflow: hidden; }.preview-panel-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #e4ecea; color: #527570; font-size: 11px; }.preview-panel-head span { display: flex; align-items: center; gap: 6px; }.preview-panel-head em { padding: 4px 7px; border-radius: 6px; background: #e5f2ed; color: #49847a; font-size: 9px; font-style: normal; }.article-live-preview { min-height: 520px; }.preview-cover { position: relative; height: 170px; overflow: hidden; }.preview-cover img { width: 100%; height: 100%; object-fit: cover; }.preview-cover:after { position: absolute; inset: 0; background: linear-gradient(180deg, transparent, rgba(13,52,53,.56)); content: ""; }.preview-cover span { position: absolute; right: 18px; bottom: 16px; z-index: 1; color: #fff; font-size: 10px; }.preview-content { padding: 20px; }.preview-content > p { color: #6c9993; font-size: 10px; }.preview-content h2 { margin-top: 8px; color: #244543; font-family: "Noto Serif SC", serif; font-size: 21px; line-height: 1.35; }.preview-summary { margin-top: 12px; color: #68837f; font-size: 11px; line-height: 1.6; }.preview-body { display: -webkit-box; overflow: hidden; margin-top: 20px; color: #4d6864; font-size: 12px; line-height: 1.9; -webkit-box-orient: vertical; -webkit-line-clamp: 8; white-space: pre-wrap; }.preview-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 24px; padding-top: 13px; border-top: 1px solid #e4ecea; color: #3c8077; font-size: 10px; }.editor-state { display: flex; align-items: center; justify-content: center; gap: 12px; min-height: 340px; color: #7e9994; font-size: 12px; }.error-state { flex-direction: column; color: #9a5f57; }
.article-editor-toast { z-index: 80; }
.cover-mode-tabs { display: flex; gap: 8px; margin-bottom: 14px; }.cover-mode-tabs button { min-height: 34px; padding: 0 13px; border: 1px solid #d3e2de; border-radius: 8px; background: #fff; color: #66847e; font-size: 11px; }.cover-mode-tabs button.active { border-color: #0f766e; background: #0f766e; color: #fff; }.cover-options { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }.cover-option { display: flex; flex-direction: column; gap: 6px; padding: 6px; border: 1px solid #dce8e4; border-radius: 9px; background: #fff; color: #527570; text-align: left; }.cover-option.selected { border-color: #0f766e; box-shadow: 0 0 0 2px rgba(15,118,110,.12); }.cover-option img { width: 100%; aspect-ratio: 16 / 9; border-radius: 6px; object-fit: cover; }.cover-option span { overflow: hidden; padding: 0 3px 3px; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }.cover-upload-zone { margin-top: 0 !important; }.cover-section .upload-drop-zone { position: relative; display: flex; min-height: 100px; align-items: center; justify-content: center; gap: 6px; flex-direction: column; padding: 18px; border: 1px dashed #a8c9c2; border-radius: 12px; background: #f4faf8; color: #386b65; cursor: pointer; text-align: center; transition: border-color .16s ease, background .16s ease, box-shadow .16s ease; }.cover-section .upload-drop-zone:hover, .cover-section .upload-drop-zone.is-dragging { border-color: #0f766e; background: #e3f3ee; box-shadow: inset 0 0 0 2px rgba(15,118,110,.08); }.cover-section .upload-drop-title { font-size: 13px; font-weight: 700; }.cover-section .upload-drop-subtitle { color: #809995; font-size: 10px; }.cover-section .upload-drop-input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
@media (max-width: 1120px) { .article-editor-page { padding: 28px; }.article-editor-grid { grid-template-columns: 1fr; }.article-preview-panel { position: static; }.product-picker-list { grid-template-columns: 1fr; } }
</style>

