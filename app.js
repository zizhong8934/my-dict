(() => {
  "use strict";

  const STORE_KEY = "my-dict-v2-cards";
  const PRACTICE_KEY = "my-dict-v2-practice";
  const MAX_IMAGE_SIDE = 2200;
  const PHRASE_MEANINGS = new Map([
    ["look forward to", "期待；盼望"], ["take care of", "照顾；负责处理"], ["in charge of", "负责；主管"],
    ["be able to", "能够；会"], ["as soon as", "一……就……；尽快"], ["at least", "至少"],
    ["a lot of", "许多；大量"], ["according to", "根据；按照"], ["instead of", "代替；而不是"],
    ["because of", "因为；由于"], ["such as", "例如；诸如"], ["for example", "例如"],
    ["pay attention to", "注意；留意"], ["get along with", "与……相处；进展"], ["make sure", "确保；查明"],
    ["used to", "过去常常"], ["be used to", "习惯于；被用于"], ["depend on", "依靠；取决于"],
    ["deal with", "处理；应对"], ["find out", "查明；发现"], ["put on", "穿上；播放；上演"],
    ["take off", "脱下；起飞"], ["turn on", "打开"], ["turn off", "关闭"], ["pick up", "捡起；接人；学会"],
    ["go through", "经历；检查；完成"], ["carry out", "执行；实施"], ["set up", "建立；安装"],
    ["work out", "解决；锻炼；计算出"], ["come up with", "想出；提出"], ["on time", "准时"],
    ["in time", "及时"], ["in order to", "为了"], ["by the way", "顺便说一下"],
    ["right away", "立刻；马上"], ["no longer", "不再"], ["all kinds of", "各种各样的"],
    ["tape measure", "卷尺"], ["safety glasses", "护目镜"], ["circular saw", "圆锯"],
    ["drywall screw", "石膏板螺钉"], ["power drill", "电钻"], ["utility knife", "美工刀；工具刀"]
  ]);
  const state = {
    cards: loadCards(),
    latest: [],
    shardPromises: new Map(),
    shardMaps: new Map(),
    worker: null,
    scanning: false,
    cancelled: false,
    practice: loadPracticeRecords(),
    game: null,
    selectedDay: localDateKey(new Date()),
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const ui = {
    cameraInput: $("#cameraInput"), galleryInput: $("#galleryInput"), quickModal: $("#quickModal"),
    quickInput: $("#quickInput"), quickStatus: $("#quickStatus"), scanPanel: $("#scanPanel"),
    scanTitle: $("#scanTitle"), scanMessage: $("#scanMessage"), progressNumber: $("#progressNumber"),
    progressBar: $("#progressBar"), scanPreview: $("#scanPreview"), scanOverlay: $("#scanOverlay"),
    latestCards: $("#latestCards"), latestEmpty: $("#latestEmpty"), todayCards: $("#todayCards"),
    todaySummary: $("#todaySummary"), libraryCards: $("#libraryCards"), librarySearch: $("#librarySearch"),
    librarySummary: $("#librarySummary"), toast: $("#toast"), template: $("#wordCardTemplate"),
    practiceModal: $("#practiceModal"), practiceMenu: $("#practiceMenu"), practicePlay: $("#practicePlay"),
    practiceResult: $("#practiceResult"), practiceInput: $("#practiceInput"), practiceFeedback: $("#practiceFeedback"),
    practiceMeaning: $("#practiceMeaning"), practiceWordHint: $("#practiceWordHint"), sentencePrompt: $("#sentencePrompt"),
    letterGuide: $("#letterGuide"), miniMonster: $("#miniMonster"), monsterStage: $("#monsterStage"),
    practiceHint: $("#practiceHint"),
    practiceDate: $("#practiceDate"), selectedDayTitle: $("#selectedDayTitle"),
  };

  let hyphenator = null;
  try {
    if (window.Hypher && window.hyphenationEnUS) hyphenator = new window.Hypher(window.hyphenationEnUS);
  } catch (error) {
    console.warn("Syllable helper unavailable", error);
  }

  bindEvents();
  renderAll();
  refreshStoredPhraseMeanings().catch(() => {});
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(() => {});

  function bindEvents() {
    $("#cameraButton").addEventListener("click", () => ui.cameraInput.click());
    $("#galleryButton").addEventListener("click", () => ui.galleryInput.click());
    $("#quickButton").addEventListener("click", openQuick);
    $("#closeQuickButton").addEventListener("click", closeQuick);
    $("#generateButton").addEventListener("click", generateManualCards);
    $("#settingsButton").addEventListener("click", () => showView("settings"));
    $("#clearLatestButton").addEventListener("click", () => { state.latest = []; renderLatest(); });
    $("#eraseButton").addEventListener("click", eraseAll);
    ui.cameraInput.addEventListener("change", (event) => scanFiles(event.target.files));
    ui.galleryInput.addEventListener("change", (event) => scanFiles(event.target.files));
    ui.librarySearch.addEventListener("input", renderLibrary);
    ui.quickModal.addEventListener("click", (event) => { if (event.target === ui.quickModal) closeQuick(); });
    $("#startTypingGame").addEventListener("click", () => openPractice("typing"));
    $("#startSentenceGame").addEventListener("click", () => openPractice("sentence"));
    $("#menuTypingGame").addEventListener("click", () => startPractice("typing"));
    $("#menuSentenceGame").addEventListener("click", () => startPractice("sentence"));
    $("#closePracticeButton").addEventListener("click", closePractice);
    $("#practiceDone").addEventListener("click", closePractice);
    $("#practiceAgain").addEventListener("click", () => startPractice(state.game?.mode || "typing"));
    $("#practiceAnswerForm").addEventListener("submit", submitPracticeAnswer);
    $("#practiceSkip").addEventListener("click", skipPracticeWord);
    $("#practiceSpeak").addEventListener("click", speakPracticePrompt);
    ui.practiceHint.addEventListener("click", usePracticeHint);
    ui.practiceInput.addEventListener("input", renderLetterGuide);
    ui.practiceDate.addEventListener("change", () => setSelectedDay(ui.practiceDate.value));
    $("#previousRecordDay").addEventListener("click", () => moveToRecordDay(-1));
    $("#nextRecordDay").addEventListener("click", () => moveToRecordDay(1));
    $("#selectToday").addEventListener("click", () => setSelectedDay(localDateKey(new Date())));
    $$(".nav-item").forEach((button) => button.addEventListener("click", () => showView(button.dataset.target)));
  }

  function showView(name) {
    $$(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === name));
    $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.target === name));
    if (name === "today") renderToday();
    if (name === "library") renderLibrary();
    scrollTo({ top: 0, behavior: "smooth" });
  }

  function openQuick() {
    ui.quickModal.classList.remove("hidden");
    setTimeout(() => ui.quickInput.focus(), 80);
  }

  function closeQuick() { ui.quickModal.classList.add("hidden"); }

  async function generateManualCards() {
    const rows = parseManualInput(ui.quickInput.value);
    if (!rows.length) {
      ui.quickStatus.textContent = "请先输入至少一个英文单词。";
      return;
    }
    $("#generateButton").disabled = true;
    ui.quickStatus.textContent = `正在生成 ${rows.length} 张卡片…`;
    try {
      const cards = [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const dictionary = row.meaning ? null : await lookupDictionary(row.word);
        cards.push(makeCard({
          word: row.word,
          meaning: row.meaning || dictionaryMeaning(dictionary),
          phonetic: dictionary?.phonetic || "",
          source: row.meaning ? "你输入的中文" : dictionary ? (row.word.includes(" ") ? "本地短语词典" : "本地词典") : (row.word.includes(" ") ? "短语释义待补充" : "等待补充释义"),
          confidence: 100,
          needsReview: !row.meaning && !dictionary,
          origin: "manual",
          order: i,
        }));
      }
      addCards(cards);
      ui.quickInput.value = "";
      closeQuick();
      showView("classroom");
      toast(`已直接生成 ${cards.length} 张卡片`);
    } finally {
      $("#generateButton").disabled = false;
      ui.quickStatus.textContent = "中文意思会优先使用；没有中文时自动查本地词典。";
    }
  }

  function parseManualInput(text) {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const chineseAt = line.search(/[\u3400-\u9fff]/);
      let word = chineseAt >= 0 ? line.slice(0, chineseAt) : line;
      let meaning = chineseAt >= 0 ? line.slice(chineseAt) : "";
      word = word.replace(/[：:＝=—–,，;；]+$/g, "").trim().replace(/\s+/g, " ");
      meaning = meaning.replace(/^[：:＝=—–,，;；\s]+/g, "").trim();
      return { word, meaning };
    }).filter((row) => /[a-z]/i.test(row.word));
  }

  async function scanFiles(fileList) {
    const files = [...fileList];
    ui.cameraInput.value = "";
    ui.galleryInput.value = "";
    if (!files.length || state.scanning) return;
    state.scanning = true;
    state.cancelled = false;
    state.latest = [];
    renderLatest();
    ui.scanPanel.classList.remove("hidden");
    showView("classroom");
    try {
      for (let index = 0; index < files.length; index += 1) {
        if (state.cancelled) break;
        await scanOne(files[index], index + 1, files.length);
      }
    } catch (error) {
      console.error(error);
      setProgress(0, "识别没有完成", readableError(error));
      toast("这张照片识别失败，请换一张清晰照片重试");
    } finally {
      state.scanning = false;
      if (state.latest.length) {
        setProgress(100, "卡片已经生成", `共生成 ${state.latest.length} 张，重复词已按原顺序保留。`);
      }
    }
  }

  async function scanOne(file, fileIndex, totalFiles) {
    setProgress(2, `正在读取第 ${fileIndex}/${totalFiles} 张`, "照片只在当前设备中处理，不会上传。", true);
    const image = await loadImageFile(file);
    ui.scanPreview.src = image.objectUrl;
    const canvas = drawScaledImage(image.element, MAX_IMAGE_SIDE);
    image.revoke();
    setProgress(8, "正在启动离线识别", "第一次使用会稍慢，之后会更快。", true);
    const worker = await ensureWorker();
    setProgress(16, "正在读取页面文字", "正在同时判断黄色、橙色等常见记号笔区域。", true);
    await worker.setParameters({ tessedit_pageseg_mode: "3" });
    const result = await worker.recognize(canvas, { rotateAuto: true }, { blocks: true, imageColor: true, tsv: true });
    if (state.cancelled) return;
    setProgress(82, "正在筛选标记词", "按照从左到右、再从上到下的阅读顺序排列。", true);
    const processedCanvas = result.data.imageColor ? await canvasFromSource(result.data.imageColor) : canvas;
    if (result.data.imageColor) ui.scanPreview.src = result.data.imageColor;
    const imageData = processedCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, processedCanvas.width, processedCanvas.height);
    const regions = findMarkerRegions(imageData);
    const candidates = flattenOcrWords(result.data.blocks).map((word) => {
      const adaptive = adaptiveMarkerMetrics(word.bbox, imageData);
      return {
        ...word,
        ...adaptive,
        highlightScore: coreOverlapScore(word.bbox, regions),
        pixelScore: highlightScore(word.bbox, imageData),
        contrast: markerContrast(word.bbox, imageData),
        regionId: bestRegionId(word.bbox, regions),
        pass: "full",
      };
    }).filter((word) => (((word.highlightScore >= .15 && word.contrast >= .08) || word.pixelScore >= .16) && word.confidence >= 8) || (word.adaptiveScore >= .48 && word.confidence >= 1));
    setProgress(78, "正在增强阴影区域", "对弯曲、阴影和浅色标记再识别一次。", true);
    const enhancedCanvas = enhanceTextCanvas(processedCanvas);
    const enhancedResult = await worker.recognize(enhancedCanvas, {}, { blocks: true, tsv: true });
    flattenOcrWords(enhancedResult.data.blocks).forEach((word) => {
      const highlightScore = coreOverlapScore(word.bbox, regions);
      const contrast = markerContrast(word.bbox, imageData);
      const adaptive = adaptiveMarkerMetrics(word.bbox, imageData);
      if ((highlightScore >= .15 && contrast >= .08) || (adaptive.adaptiveScore >= .48 && word.confidence >= 1)) candidates.push({
        ...word, ...adaptive, highlightScore, contrast, regionId: bestRegionId(word.bbox, regions), pass: "enhanced",
      });
    });
    await worker.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "" });
    for (let regionId = 0; regionId < regions.length; regionId += 1) {
      const region = regions[regionId];
      for (const psm of [7, 8]) {
        await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
        const pass = await worker.recognize(processedCanvas, { rectangle: {
          left: region.x0, top: region.y0, width: region.x1 - region.x0, height: region.y1 - region.y0,
        } }, { blocks: true, tsv: true });
        flattenOcrWords(pass.data.blocks).forEach((word) => {
          const highlightScore = coreOverlapScore(word.bbox, [region]);
          const contrast = markerContrast(word.bbox, imageData);
          const adaptive = adaptiveMarkerMetrics(word.bbox, imageData);
          if ((highlightScore >= .15 && contrast >= .08) || highlightScore >= .28 || adaptive.adaptiveScore >= .48) candidates.push({ ...word, ...adaptive, highlightScore, contrast, regionId, pass: `psm${psm}` });
        });
      }
      await worker.setParameters({ tessedit_pageseg_mode: "7" });
      const shadowPass = await worker.recognize(enhancedCanvas, { rectangle: {
        left: region.x0, top: region.y0, width: region.x1 - region.x0, height: region.y1 - region.y0,
      } }, { blocks: true, tsv: true });
      flattenOcrWords(shadowPass.data.blocks).forEach((word) => {
        const highlightScore = coreOverlapScore(word.bbox, [region]);
        const contrast = markerContrast(word.bbox, imageData);
        const adaptive = adaptiveMarkerMetrics(word.bbox, imageData);
        if ((highlightScore >= .15 && contrast >= .04) || highlightScore >= .28 || adaptive.adaptiveScore >= .48) candidates.push({ ...word, ...adaptive, highlightScore, contrast, regionId, pass: "shadow-psm7" });
      });
      setProgress(82 + Math.round((regionId + 1) / Math.max(1, regions.length) * 6), "正在核对每个色块", `已核对 ${regionId + 1}/${regions.length} 个标记区域。`, true);
    }
    await worker.setParameters({ tessedit_pageseg_mode: "3", tessedit_char_whitelist: "" });
    const selected = await refineOcrCandidates(mergeCandidates(candidates));
    drawOverlay(selected, processedCanvas.width, processedCanvas.height);
    setProgress(88, "正在查本地词典", `发现 ${selected.length} 个标记词，正在自动生成卡片。`, true);
    const cards = [];
    for (let index = 0; index < selected.length; index += 1) {
      const item = selected[index];
      const dictionary = item.dictionary || await lookupDictionary(item.word, true);
      cards.push(makeCard({
        word: item.word,
        meaning: dictionaryMeaning(dictionary),
        phonetic: dictionary?.phonetic || "",
        source: `照片 ${fileIndex} · 自动提取`,
        confidence: Math.round(item.confidence),
        needsReview: item.confidence < 62 || item.highlightScore < .14 || !dictionary,
        origin: "photo",
        order: index,
        bbox: item.bbox,
        highlightScore: item.highlightScore,
      }));
    }
    addCards(cards);
    setProgress(100, `第 ${fileIndex}/${totalFiles} 张已完成`, cards.length ? `已自动生成 ${cards.length} 张卡片。` : "没有找到明确标记词：照片可能模糊、阴影太重或标记颜色太浅，请靠近并保持页面平整后重拍。", true);
  }

  async function ensureWorker() {
    if (state.worker) return state.worker;
    if (!window.Tesseract) throw new Error("离线识别组件未加载");
    const base = new URL(".", location.href);
    state.worker = await window.Tesseract.createWorker("eng_best", 1, {
      workerPath: new URL("vendor/tesseract/worker.min.js", base).href,
      corePath: new URL("vendor/tesseract/core/tesseract-core-lstm.wasm.js", base).href,
      langPath: new URL("vendor/tesseract/lang", base).href.replace(/\/$/, ""),
      cacheMethod: "none",
      logger: (message) => {
        if (!message.progress || !state.scanning) return;
        const progress = 16 + Math.round(message.progress * 62);
        setProgress(progress, ocrStatusText(message.status), "正在本机分析文字和标记颜色。", true);
      },
    });
    await state.worker.setParameters({
      tessedit_pageseg_mode: "3",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    return state.worker;
  }

  function ocrStatusText(status = "") {
    if (status.includes("loading")) return "正在载入离线识别引擎";
    if (status.includes("initializing")) return "正在准备英文识别模型";
    if (status.includes("recognizing")) return "正在读取页面文字";
    return "正在处理照片";
  }

  function flattenOcrWords(blocks) {
    const output = [];
    for (const block of blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          for (const word of line.words || []) {
            const clean = cleanOcrWord(word.text);
            if (!clean || clean.length < 2 || clean.length > 45) continue;
            output.push({ word: clean, confidence: Number(word.confidence || 0), bbox: normalizeBbox(word.bbox) });
          }
        }
      }
    }
    return output.filter((item) => item.bbox && item.confidence >= 1);
  }

  function cleanOcrWord(text) {
    const clean = String(text || "").replace(/[’‘]/g, "'").replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, "");
    if (!/^[A-Za-z][A-Za-z'-]*[A-Za-z]$|^[A-Za-z]{2,}$/.test(clean)) return "";
    if (/^(ii|iii|iv|vi|vii|viii|ix|xi|xii)$/i.test(clean)) return "";
    return clean.toLowerCase();
  }

  function normalizeBbox(box) {
    if (!box) return null;
    const x0 = Number(box.x0 ?? box.left ?? 0), y0 = Number(box.y0 ?? box.top ?? 0);
    const x1 = Number(box.x1 ?? (x0 + Number(box.width || 0))), y1 = Number(box.y1 ?? (y0 + Number(box.height || 0)));
    return { x0, y0, x1, y1 };
  }

  function selectHighlightedWords(words, canvas) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const scored = words.map((item) => ({ ...item, highlightScore: highlightScore(item.bbox, image) }));
    const strong = scored.filter((item) => item.highlightScore >= .075 && item.confidence >= 18);
    const lenient = scored.filter((item) => item.highlightScore >= .13 && item.confidence >= 8);
    const merged = new Map();
    [...strong, ...lenient].forEach((item) => merged.set(`${item.bbox.x0}:${item.bbox.y0}:${item.word}`, item));
    return readingOrder([...merged.values()]);
  }

  function highlightScore(box, image) {
    const width = Math.max(1, box.x1 - box.x0), height = Math.max(1, box.y1 - box.y0);
    const x0 = Math.max(0, Math.floor(box.x0 - width * .08));
    const x1 = Math.min(image.width - 1, Math.ceil(box.x1 + width * .08));
    const y0 = Math.max(0, Math.floor(box.y0 - height * .14));
    const y1 = Math.min(image.height - 1, Math.ceil(box.y1 + height * .14));
    const step = Math.max(1, Math.floor(Math.min(width, height) / 14));
    let marked = 0, count = 0;
    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) {
        const offset = (y * image.width + x) * 4;
        const r = image.data[offset] / 255, g = image.data[offset + 1] / 255, b = image.data[offset + 2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
        let hue = 0;
        if (delta) {
          if (max === r) hue = 60 * (((g - b) / delta) % 6);
          else if (max === g) hue = 60 * ((b - r) / delta + 2);
          else hue = 60 * ((r - g) / delta + 4);
          if (hue < 0) hue += 360;
        }
        const saturation = max ? delta / max : 0;
        // The simple pixel pass intentionally accepts paler yellow marker ink.
        // Dense-region detection below remains stricter, so ordinary beige paper
        // does not become a marker region while thin strokes still get a chance.
        const isHighlighter = hue >= 18 && hue <= 72 && saturation >= .36 && max >= .42;
        if (isHighlighter) marked += 1;
        count += 1;
      }
    }
    return count ? marked / count : 0;
  }

  function readingOrder(items) {
    if (!items.length) return [];
    const heights = items.map((item) => Math.max(1, item.bbox.y1 - item.bbox.y0)).sort((a, b) => a - b);
    const medianHeight = heights[Math.floor(heights.length / 2)] || 20;
    const rows = [];
    [...items].sort((a, b) => centerY(a) - centerY(b)).forEach((item) => {
      // Phone photos are commonly tilted; tolerate a moderate baseline slope so
      // words on the same printed line still sort from left to right.
      let row = rows.find((candidate) => Math.abs(candidate.y - centerY(item)) <= medianHeight * 1.35);
      if (!row) { row = { y: centerY(item), items: [] }; rows.push(row); }
      row.items.push(item);
      row.y = row.items.reduce((sum, word) => sum + centerY(word), 0) / row.items.length;
    });
    rows.sort((a, b) => a.y - b.y);
    return rows.flatMap((row) => row.items.sort((a, b) => a.bbox.x0 - b.bbox.x0));
  }

  function markerPixelStrength(r8, g8, b8) {
    const r = r8 / 255, g = g8 / 255, b = b8 / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
      if (hue < 0) hue += 360;
    }
    const saturation = max ? delta / max : 0;
    if (!(hue >= 18 && hue <= 72 && max >= .36)) return 0;
    if (saturation >= .5 && r > b * 1.7 && g > b * 1.35) return 2;
    if (saturation >= .2 && r > b * 1.25 && g > b * 1.08) return 1;
    return 0;
  }

  function isMarkerPixel(r8, g8, b8) { return markerPixelStrength(r8, g8, b8) > 0; }

  function findMarkerRegions(image) {
    const stride = 3, gw = Math.ceil(image.width / stride), gh = Math.ceil(image.height / stride);
    const mask = new Uint8Array(gw * gh), dense = new Uint8Array(gw * gh), seen = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy += 1) for (let gx = 0; gx < gw; gx += 1) {
      const x = Math.min(image.width - 1, gx * stride), y = Math.min(image.height - 1, gy * stride);
      const p = (y * image.width + x) * 4;
      mask[gy * gw + gx] = markerPixelStrength(image.data[p], image.data[p + 1], image.data[p + 2]);
    }
    for (let gy = 1; gy < gh - 1; gy += 1) for (let gx = 1; gx < gw - 1; gx += 1) {
      let paleNeighbors = 0, strongNeighbors = 0;
      for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
        const value = mask[(gy + oy) * gw + gx + ox];
        if (value) paleNeighbors += 1;
        if (value === 2) strongNeighbors += 1;
      }
      if (strongNeighbors >= 5 || paleNeighbors >= 7) dense[gy * gw + gx] = 1;
    }
    const boxes = [], stack = [];
    for (let start = 0; start < dense.length; start += 1) {
      if (!dense[start] || seen[start]) continue;
      seen[start] = 1; stack.push(start);
      let minX = gw, maxX = 0, minY = gh, maxY = 0, count = 0;
      while (stack.length) {
        const current = stack.pop(), x = current % gw, y = Math.floor(current / gw);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); count += 1;
        for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
          if (!ox && !oy) continue;
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const next = ny * gw + nx;
          if (dense[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
        }
      }
      const width = (maxX - minX + 1) * stride, height = (maxY - minY + 1) * stride;
      if (count >= 10 && width >= 12 && height >= 6 && width < image.width * .72 && height < image.height * .12) {
        boxes.push({ x0: minX * stride, y0: minY * stride, x1: Math.min(image.width, (maxX + 1) * stride), y1: Math.min(image.height, (maxY + 1) * stride) });
      }
    }
    const expanded = boxes.map((core) => {
      const width = core.x1 - core.x0, height = core.y1 - core.y0;
      return {
        x0: Math.max(0, Math.floor(core.x0 - Math.max(12, width * .24))),
        y0: Math.max(0, Math.floor(core.y0 - Math.max(6, height * .27))),
        x1: Math.min(image.width, Math.ceil(core.x1 + Math.max(12, width * .24))),
        y1: Math.min(image.height, Math.ceil(core.y1 + Math.max(6, height * .27))),
        cores: [core],
      };
    });
    return mergeRegions(expanded);
  }

  function mergeRegions(boxes) {
    const result = [];
    for (const box of boxes.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
      const hit = result.find((other) => {
        const yOverlap = Math.min(box.y1, other.y1) - Math.max(box.y0, other.y0);
        const minHeight = Math.min(box.y1 - box.y0, other.y1 - other.y0);
        const xGap = Math.max(0, Math.max(box.x0, other.x0) - Math.min(box.x1, other.x1));
        return yOverlap > minHeight * .55 && xGap < Math.max(14, minHeight * .38);
      });
      if (hit) {
        hit.x0 = Math.min(hit.x0, box.x0); hit.y0 = Math.min(hit.y0, box.y0);
        hit.x1 = Math.max(hit.x1, box.x1); hit.y1 = Math.max(hit.y1, box.y1);
        hit.cores.push(...box.cores);
      } else result.push({ ...box, cores: [...box.cores] });
    }
    return readingOrder(result.map((bbox) => ({ bbox }))).map((item) => item.bbox);
  }

  function coreOverlapScore(box, regions) {
    const area = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0));
    let best = 0;
    for (const region of regions) for (const core of region.cores || [region]) {
      const width = Math.max(0, Math.min(box.x1, core.x1) - Math.max(box.x0, core.x0));
      const height = Math.max(0, Math.min(box.y1, core.y1) - Math.max(box.y0, core.y0));
      best = Math.max(best, width * height / area);
    }
    return best;
  }

  function bestRegionId(box, regions) {
    let best = -1, score = 0;
    regions.forEach((region, index) => {
      const value = coreOverlapScore(box, [region]);
      if (value > score) { score = value; best = index; }
    });
    return best;
  }

  function markerContrast(box, image) {
    const width = Math.max(2, box.x1 - box.x0), height = Math.max(2, box.y1 - box.y0);
    const inner = { x0: Math.max(0, Math.floor(box.x0)), y0: Math.max(0, Math.floor(box.y0 - height * .12)), x1: Math.min(image.width, Math.ceil(box.x1)), y1: Math.min(image.height, Math.ceil(box.y1 + height * .12)) };
    const outer = { x0: Math.max(0, Math.floor(box.x0 - width * .3)), y0: Math.max(0, Math.floor(box.y0 - height * .8)), x1: Math.min(image.width, Math.ceil(box.x1 + width * .3)), y1: Math.min(image.height, Math.ceil(box.y1 + height * .8)) };
    let inMarked = 0, inCount = 0, outMarked = 0, outCount = 0;
    const step = Math.max(1, Math.floor(Math.min(width, height) / 12));
    for (let y = outer.y0; y < outer.y1; y += step) for (let x = outer.x0; x < outer.x1; x += step) {
      const p = (y * image.width + x) * 4;
      const marked = isMarkerPixel(image.data[p], image.data[p + 1], image.data[p + 2]) ? 1 : 0;
      if (x >= inner.x0 && x < inner.x1 && y >= inner.y0 && y < inner.y1) { inMarked += marked; inCount += 1; }
      else { outMarked += marked; outCount += 1; }
    }
    return (inCount ? inMarked / inCount : 0) - (outCount ? outMarked / outCount : 0);
  }

  function adaptiveMarkerMetrics(box, image) {
    const width = Math.max(2, box.x1 - box.x0), height = Math.max(2, box.y1 - box.y0);
    const inner = {
      x0: Math.max(0, Math.floor(box.x0 - width * .04)), x1: Math.min(image.width, Math.ceil(box.x1 + width * .04)),
      y0: Math.max(0, Math.floor(box.y0 - height * .45)), y1: Math.min(image.height, Math.ceil(box.y1 + height * .45)),
    };
    const outer = {
      x0: Math.max(0, Math.floor(box.x0 - width * .22)), x1: Math.min(image.width, Math.ceil(box.x1 + width * .22)),
      y0: Math.max(0, Math.floor(box.y0 - height * 1.15)), y1: Math.min(image.height, Math.ceil(box.y1 + height * 1.15)),
    };
    const sample = (area, ring = false) => {
      let warm = 0, orange = 0, saturation = 0, pale = 0, count = 0;
      const step = Math.max(1, Math.floor(Math.min(width, height) / 10));
      for (let y = area.y0; y < area.y1; y += step) for (let x = area.x0; x < area.x1; x += step) {
        if (ring && x >= inner.x0 && x < inner.x1 && y >= inner.y0 && y < inner.y1) continue;
        const p = (y * image.width + x) * 4;
        const r = image.data[p] / 255, g = image.data[p + 1] / 255, b = image.data[p + 2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
        if (max <= .32) continue;
        let hue = 0;
        if (delta) {
          if (max === r) hue = 60 * (((g - b) / delta) % 6);
          else if (max === g) hue = 60 * ((b - r) / delta + 2);
          else hue = 60 * ((r - g) / delta + 4);
          if (hue < 0) hue += 360;
        }
        const sat = max ? delta / max : 0;
        warm += (r + g) / 2 - b;
        orange += r - b;
        saturation += sat;
        if (hue >= 8 && hue <= 82 && sat >= .08) pale += 1;
        count += 1;
      }
      return count ? { warm: warm / count, orange: orange / count, saturation: saturation / count, pale: pale / count } : { warm: 0, orange: 0, saturation: 0, pale: 0 };
    };
    const inside = sample(inner), outside = sample(outer, true);
    const warmDelta = inside.warm - outside.warm;
    const orangeDelta = inside.orange - outside.orange;
    const saturationDelta = inside.saturation - outside.saturation;
    const paleDelta = inside.pale - outside.pale;
    const adaptiveScore = Math.max(0, warmDelta * 3 + orangeDelta * 2 + saturationDelta * 1.2 + Math.max(0, paleDelta) * .7);
    return { adaptiveScore, warmDelta, orangeDelta, saturationDelta, paleDelta };
  }

  function enhanceTextCanvas(source) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    ctx.drawImage(source, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const histogram = new Uint32Array(256);
    for (let p = 0; p < image.data.length; p += 4) histogram[Math.round(image.data[p] * .299 + image.data[p + 1] * .587 + image.data[p + 2] * .114)] += 1;
    const total = canvas.width * canvas.height;
    let low = 0, high = 255, sum = 0;
    while (low < 255 && (sum += histogram[low]) < total * .03) low += 1;
    sum = 0;
    while (high > 0 && (sum += histogram[high]) < total * .03) high -= 1;
    const range = Math.max(24, high - low);
    for (let p = 0; p < image.data.length; p += 4) {
      const gray = image.data[p] * .299 + image.data[p + 1] * .587 + image.data[p + 2] * .114;
      const value = Math.max(0, Math.min(255, (gray - low) / range * 255));
      image.data[p] = value; image.data[p + 1] = value; image.data[p + 2] = value; image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function binarizeTextCanvas(source) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    ctx.drawImage(source, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const histogram = new Uint32Array(256);
    for (let p = 0; p < image.data.length; p += 4) histogram[Math.round(image.data[p] * .299 + image.data[p + 1] * .587 + image.data[p + 2] * .114)] += 1;
    const total = canvas.width * canvas.height;
    let low = 0, high = 255, sum = 0;
    while (low < 255 && (sum += histogram[low]) < total * .08) low += 1;
    sum = 0;
    while (high > 0 && (sum += histogram[high]) < total * .12) high -= 1;
    const threshold = Math.min(185, Math.max(92, low + (high - low) * .48));
    for (let p = 0; p < image.data.length; p += 4) {
      const gray = image.data[p] * .299 + image.data[p + 1] * .587 + image.data[p + 2] * .114;
      const value = gray < threshold ? 0 : 255;
      image.data[p] = value; image.data[p + 1] = value; image.data[p + 2] = value; image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function normalizeIlluminationCanvas(source) {
    const canvas = document.createElement("canvas"), blurred = document.createElement("canvas");
    canvas.width = blurred.width = source.width; canvas.height = blurred.height = source.height;
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    const blurCtx = blurred.getContext("2d", { alpha: false, willReadFrequently: true });
    ctx.drawImage(source, 0, 0);
    blurCtx.filter = "blur(24px)";
    blurCtx.drawImage(source, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const background = blurCtx.getImageData(0, 0, canvas.width, canvas.height);
    for (let p = 0; p < image.data.length; p += 4) {
      const gray = image.data[p] * .299 + image.data[p + 1] * .587 + image.data[p + 2] * .114;
      const local = background.data[p] * .299 + background.data[p + 1] * .587 + background.data[p + 2] * .114;
      const value = Math.max(0, Math.min(255, 236 + (gray - local) * 2.65));
      image.data[p] = value; image.data[p + 1] = value; image.data[p + 2] = value; image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function cropAndScaleCanvas(source, region, scale) {
    const width = Math.max(1, region.x1 - region.x0), height = Math.max(1, region.y1 - region.y0);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, region.x0, region.y0, width, height, 0, 0, canvas.width, canvas.height);
    return { canvas, scale };
  }

  function overlapRatio(a, b) {
    const width = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
    const height = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const overlap = width * height;
    const smaller = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
    return smaller ? overlap / smaller : 0;
  }

  function mergeCandidates(candidates) {
    const kept = [];
    for (const item of [...candidates].sort((a, b) => b.confidence - a.confidence)) {
      const conflict = kept.find((other) => overlapRatio(item.bbox, other.bbox) > .62 && (item.word === other.word || Math.abs(item.word.length - other.word.length) <= 3));
      if (!conflict) kept.push(item);
    }
    const stopwords = new Set(["a", "an", "and", "at", "be", "by", "for", "he", "her", "his", "in", "is", "my", "of", "on", "or", "our", "she", "the", "their", "to", "was", "we", "you"]);
    const filtered = kept.filter((item) => {
      if (!stopwords.has(item.word)) return true;
      return !kept.some((other) => other !== item && other.regionId === item.regionId && !stopwords.has(other.word));
    });
    return readingOrder(filtered);
  }

  async function refineOcrCandidates(items) {
    const working = [...items];
    const removed = new Set();
    for (let index = 0; index < working.length - 1; index += 1) {
      const first = working[index], second = working[index + 1];
      if (first.regionId !== second.regionId || first.word.length < 3 || second.word.length < 3) continue;
      const height = Math.max(first.bbox.y1 - first.bbox.y0, second.bbox.y1 - second.bbox.y0);
      const gap = second.bbox.x0 - first.bbox.x1;
      if (Math.abs(centerY(first) - centerY(second)) > height || gap > height * 1.8) continue;
      const joined = `${first.word}${second.word}`;
      const dictionary = await lookupDictionary(joined, true);
      if (!dictionary || editDistance(joined, dictionary.word, 2) > 2) continue;
      first.word = dictionary.word;
      first.dictionary = dictionary;
      first.confidence = Math.max(first.confidence, second.confidence);
      first.bbox = { x0: Math.min(first.bbox.x0, second.bbox.x0), y0: Math.min(first.bbox.y0, second.bbox.y0), x1: Math.max(first.bbox.x1, second.bbox.x1), y1: Math.max(first.bbox.y1, second.bbox.y1) };
      removed.add(index + 1);
    }
    const output = [];
    for (let index = 0; index < working.length; index += 1) {
      if (removed.has(index)) continue;
      const item = working[index];
      let dictionary = item.dictionary || await lookupDictionary(item.word, true);
      let addedLeadingLetter = false;
      if (!dictionary && item.word.length >= 4 && item.word.length <= 18) {
        dictionary = await lookupWithAddedLeadingLetter(item.word);
        addedLeadingLetter = Boolean(dictionary);
      }
      if (dictionary) {
        const suspiciousCompound = /^go[a-z]{4,}$/.test(item.word) || /(?:her|them|their|his)$/.test(item.word) || (item.word.length > 5 && dictionary.word === item.word.slice(1));
        const likelyOcrTypo = item.confidence < 90 && item.word.length >= 4 && dictionary.word.length >= 3 && editDistance(item.word, dictionary.word, 2) <= 2;
        if (item.word === "medias" || suspiciousCompound || likelyOcrTypo || addedLeadingLetter) item.word = dictionary.word;
        item.dictionary = dictionary;
      }
      if (item.word.length >= 3 && (dictionary || (item.contrast >= .45 && item.confidence >= 20))) output.push(item);
    }
    return readingOrder(output);
  }

  function centerY(item) { return (item.bbox.y0 + item.bbox.y1) / 2; }

  async function lookupDictionary(rawWord, fuzzy = false, exactOnly = false) {
    const normalized = String(rawWord).toLowerCase().trim().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
    // ECDICT 本身收录了大量完整短语。旧规则只允许单词，遇到空格就直接退出，
    // 导致 "look forward to" 之类明明在本地词库里却显示查不到。
    if (!/^[a-z](?:[a-z' -]*[a-z])?$/.test(normalized)) return null;
    const key = shardKey(normalized);
    let map = state.shardMaps.get(key);
    if (!map) {
      let promise = state.shardPromises.get(key);
      if (!promise) {
        promise = fetch(`./dict/${key}.json`).then((response) => response.ok ? response.json() : []).then((rows) => {
          const next = new Map(rows.map((row) => [row[0], { word: row[0], phonetic: row[1], translation: row[2], definition: row[3], rank: Number(row[5] || row[4] || 0) }]));
          state.shardMaps.set(key, next);
          return next;
        }).catch(() => new Map());
        state.shardPromises.set(key, promise);
      }
      map = await promise;
    }
    const isPhrase = normalized.includes(" ");
    if (fuzzy && !isPhrase) {
      const transformed = [];
      if (/^go[a-z]{4,}$/.test(normalized)) transformed.push(normalized.slice(2));
      if (/^(?:[a-z])(?!$)/.test(normalized)) transformed.push(normalized.slice(1));
      for (const suffix of ["her", "them", "their", "his"]) if (normalized.endsWith(suffix) && normalized.length > suffix.length + 4) transformed.push(normalized.slice(0, -suffix.length));
      for (const candidate of transformed) {
        const found = await lookupDictionary(candidate, false);
        if (found) return found;
      }
    }
    const direct = map.get(normalized);
    if (direct && exactOnly) return direct;
    if (isPhrase) {
      // 完整短语永远优先，不允许退化成其中某个单词的释义。
      if (direct) return direct;
      if (PHRASE_MEANINGS.has(normalized)) return { word: normalized, phonetic: "", translation: PHRASE_MEANINGS.get(normalized), definition: "", rank: 1 };
      const words = normalized.split(" ");
      const head = words[0];
      const headVariants = wordVariants(head).filter((word) => word !== head);
      const phraseMatches = headVariants.map((word) => map.get([word, ...words.slice(1)].join(" "))).filter(Boolean);
      return phraseMatches[0] || null;
    }
    const variants = wordVariants(normalized);
    const alternatives = variants.map((variant) => map.get(variant)).filter(Boolean);
    if (direct) {
      const commonVariant = alternatives.filter((entry) => entry.rank > 0).sort((a, b) => a.rank - b.rank)[0];
      if (commonVariant && (!direct.rank || direct.rank > commonVariant.rank * 8)) return commonVariant;
      return direct;
    }
    if (alternatives.length) return alternatives.sort((a, b) => (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER))[0];
    if (fuzzy && normalized.length >= 4) {
      const maxDistance = normalized.length <= 5 ? 1 : normalized.length <= 9 ? 2 : 3;
      let best = null, bestScore = Number.MAX_SAFE_INTEGER;
      for (const entry of map.values()) {
        if (entry.word[0] !== normalized[0] || Math.abs(entry.word.length - normalized.length) > maxDistance) continue;
        const distance = editDistance(normalized, entry.word, maxDistance);
        if (distance > maxDistance) continue;
        const score = distance * 1000000 + (entry.rank || 999999);
        if (score < bestScore) { best = entry; bestScore = score; }
      }
      if (best) return best;
    }
    return null;
  }

  function wordVariants(word) {
    const values = [word, word.replace(/'s$/, ""), word.replace(/ies$/, "y"), word.replace(/ied$/, "y"), word.replace(/ves$/, "f"), word.replace(/es$/, ""), word.replace(/s$/, ""), word.replace(/ing$/, ""), word.replace(/ed$/, "")];
    if (/ing$/.test(word)) values.push(word.slice(0, -3) + "e");
    if (/ed$/.test(word)) values.push(word.slice(0, -1));
    return [...new Set(values.filter(Boolean))];
  }

  async function lookupWithAddedLeadingLetter(word) {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const matches = (await Promise.all([...letters].map((letter) => lookupDictionary(`${letter}${word}`, false, true)))).filter(Boolean);
    if (!matches.length) return null;
    return matches.sort((a, b) => (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER))[0];
  }

  function editDistance(a, b, limit = Number.MAX_SAFE_INTEGER) {
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      let rowBest = current[0];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        rowBest = Math.min(rowBest, current[j]);
      }
      if (rowBest > limit) return limit + 1;
      previous = current;
    }
    return previous[b.length];
  }

  function shardKey(word) {
    return word.slice(0, 2).split("").map((ch) => /[a-z]/.test(ch) ? ch : "_").join("").padEnd(2, "_");
  }

  function dictionaryMeaning(entry) {
    if (!entry) return "释义待补充";
    const preferred = PHRASE_MEANINGS.get(String(entry.word || "").toLowerCase().trim().replace(/\s+/g, " "));
    if (preferred) return preferred;
    const chinese = String(entry.translation || "")
      .replace(/\[(?:网络|法|计|医|化|机|经|俚|口)\]/g, "")
      .split(/\\n|\n/).map((part) => part.trim()).filter(Boolean).slice(0, 3).join("；")
      .replace(/^(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|phr)\.\s*/i, "")
      .replace(/\s*[;；]\s*/g, "；").replace(/；{2,}/g, "；").trim();
    return chinese || entry.definition || "释义待补充";
  }

  async function refreshStoredPhraseMeanings() {
    let changed = false;
    for (const card of state.cards) {
      if (!String(card.word || "").includes(" ") || card.source === "你输入的中文") continue;
      const dictionary = await lookupDictionary(card.word);
      if (!dictionary) continue;
      const meaning = dictionaryMeaning(dictionary);
      if (meaning !== "释义待补充" && card.meaning !== meaning) { card.meaning = meaning; changed = true; }
      if (card.needsReview) { card.needsReview = false; changed = true; }
      if (card.origin === "manual" && card.source !== "本地短语词典") { card.source = "本地短语词典"; changed = true; }
    }
    if (changed) { saveCards(); renderAll(); }
  }

  function makeCard(data) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      word: data.word,
      meaning: data.meaning || "释义待补充",
      phonetic: data.phonetic || "",
      syllables: syllabify(data.word),
      source: data.source,
      confidence: data.confidence,
      needsReview: Boolean(data.needsReview),
      origin: data.origin,
      order: data.order,
      bbox: data.bbox || null,
      highlightScore: data.highlightScore || null,
    };
  }

  function syllabify(text) {
    return String(text).split(/(\s+|-)/).map((part) => {
      if (!/[a-z]/i.test(part) || part.length < 4) return part;
      try {
        const pieces = hyphenator ? hyphenator.hyphenate(part) : [];
        return pieces.length > 1 ? pieces.join(" · ") : fallbackSyllables(part);
      } catch { return fallbackSyllables(part); }
    }).join("");
  }

  function fallbackSyllables(word) {
    const pieces = word.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy](?=[^aeiouy]*[aeiouy])|[^aeiouy]*$)/gi);
    return pieces && pieces.length > 1 ? pieces.join(" · ") : word;
  }

  function addCards(cards) {
    if (!cards.length) return;
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    cards.forEach((card) => { if (!card.batchId) card.batchId = batchId; });
    // 新录入的一批整体放到前面；批内仍按用户输入/照片阅读顺序排列。
    state.latest = cards.concat(state.latest);
    state.cards.push(...cards);
    state.selectedDay = localDateKey(new Date(cards[0].createdAt));
    saveCards();
    renderAll();
  }

  function getCardsForDay(day = state.selectedDay) {
    return sortNewestBatchFirst(state.cards.filter((card) => localDateKey(new Date(card.createdAt)) === day));
  }

  function getTodayCards() {
    return getCardsForDay(state.selectedDay);
  }

  function batchKey(card) {
    if (card.batchId) return card.batchId;
    // 兼容升级前没有 batchId 的旧记录：十分钟内连续产生的卡片视作同一批。
    const time = new Date(card.createdAt).getTime();
    return `legacy-${Math.floor(time / (10 * 60 * 1000))}`;
  }

  function sortNewestBatchFirst(cards) {
    const groups = new Map();
    cards.forEach((card, sourceIndex) => {
      const key = batchKey(card);
      if (!groups.has(key)) groups.set(key, { key, cards: [], time: 0 });
      const group = groups.get(key);
      group.cards.push({ card, sourceIndex });
      group.time = Math.max(group.time, new Date(card.createdAt).getTime() || 0);
    });
    return [...groups.values()].sort((a, b) => b.time - a.time).flatMap((group) => group.cards
      .sort((a, b) => (Number(a.card.order) - Number(b.card.order)) || a.sourceIndex - b.sourceIndex)
      .map((item) => item.card));
  }

  function getPracticeCards() {
    // 游戏使用用户所选日期的全部单词，新批次先练、批内顺序不变，重复词保留。
    return getCardsForDay(state.selectedDay);
  }

  function renderPracticeEntry(cards = getPracticeCards()) {
    const disabled = cards.length === 0;
    $("#startTypingGame").disabled = disabled;
    $("#startSentenceGame").disabled = disabled;
    const selectedSessions = state.practice.cardDays?.[state.selectedDay]?.sessions || 0;
    const minutes = Math.max(1, Math.ceil(cards.length * 18 / 60));
    const label = displayDay(state.selectedDay);
    $("#practiceEntryTitle").textContent = `${label}的词，马上练一遍`;
    $("#practiceSummary").textContent = disabled
      ? `${label}没有单词记录，请选择其他日期。`
      : `${label}共 ${cards.length} 个词 · 每轮约 ${minutes} 分钟${selectedSessions ? ` · 这组已练 ${selectedSessions} 轮` : ""}`;
  }

  function openPractice(mode) {
    const cards = getPracticeCards();
    if (!cards.length) return toast("所选日期没有单词，请换一天");
    ui.practiceModal.classList.remove("hidden");
    document.body.classList.add("practice-open");
    $("#practiceMenuDescription").textContent = `使用${displayDay(state.selectedDay)}录入的全部单词。重复词保留，答错的词会在本轮末尾再次出现。`;
    if (mode) startPractice(mode);
    else showPracticePanel("menu");
  }

  function closePractice() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    state.game = null;
    ui.practiceModal.classList.add("hidden");
    document.body.classList.remove("practice-open");
    renderPracticeEntry();
  }

  function showPracticePanel(name) {
    ui.practiceMenu.classList.toggle("hidden", name !== "menu");
    ui.practicePlay.classList.toggle("hidden", name !== "play");
    ui.practiceResult.classList.toggle("hidden", name !== "result");
  }

  function startPractice(mode) {
    const cards = getPracticeCards();
    if (!cards.length) return closePractice();
    const queue = cards.map((card) => ({ card, retry: 0 }));
    state.game = {
      mode,
      queue,
      baseCount: queue.length,
      index: 0,
      correct: 0,
      firstCorrect: 0,
      missed: 0,
      reviewIds: new Set(),
      wrongAttempts: 0,
      firstAttempt: true,
      sentence: null,
      locked: false,
      hintLevel: 0,
      hintsUsed: 0,
      cardDay: state.selectedDay,
    };
    $("#practiceKicker").textContent = mode === "typing" ? "MONSTER TYPING" : "SENTENCE SPELLING";
    $("#practiceTitle").textContent = mode === "typing" ? "海怪速击" : "句子拼读";
    $("#practiceMenuNote").textContent = `${displayDay(state.selectedDay)}共 ${cards.length} 个词；新批次在前，每批内部仍按录入顺序。`;
    ui.monsterStage.classList.toggle("sentence-mode", mode === "sentence");
    showPracticePanel("play");
    renderPracticeQuestion();
  }

  function currentPracticeItem() {
    return state.game?.queue[state.game.index] || null;
  }

  function renderPracticeQuestion() {
    const game = state.game;
    const item = currentPracticeItem();
    if (!game || !item) return finishPractice();
    const card = item.card;
    game.wrongAttempts = 0;
    game.firstAttempt = true;
    game.locked = false;
    game.hintLevel = 0;
    game.sentence = game.mode === "sentence" ? buildPracticeSentence(card, game.index) : null;
    $("#practiceProgressText").textContent = `${game.index + 1} / ${game.queue.length}`;
    $("#practiceScoreText").textContent = `正确 ${game.correct}`;
    $("#practiceProgressBar").style.width = `${Math.round(game.index / Math.max(1, game.queue.length) * 100)}%`;
    $("#practiceLabel").textContent = game.mode === "typing" ? "根据中文和音节拼写" : "把生词填回句子";
    ui.practiceMeaning.textContent = cleanPracticeMeaning(card.meaning);
    ui.sentencePrompt.classList.toggle("hidden", game.mode !== "sentence");
    if (game.sentence) setSentencePrompt(game.sentence.blank);
    const seen = state.practice.words[practiceWordKey(card)]?.seen || 0;
    ui.practiceHint.classList.toggle("hidden", game.mode !== "sentence");
    ui.practiceHint.disabled = false;
    ui.practiceHint.textContent = "提示 0/3";
    ui.practiceWordHint.textContent = game.mode === "typing" && seen === 0 && item.retry === 0
      ? `第一次出现 · 照着拼写：${card.word}`
      : `${card.syllables || syllabify(card.word)} · ${game.mode === "sentence" ? hintedWord(card.word, 0) : maskedWord(card.word)}`;
    ui.practiceInput.value = "";
    ui.practiceInput.placeholder = card.word.includes(" ") ? "输入英文单词或短语" : "输入英文单词";
    ui.practiceFeedback.textContent = "";
    ui.practiceFeedback.className = "practice-feedback";
    ui.miniMonster.classList.remove("hit", "miss");
    renderLetterGuide();
    setTimeout(() => ui.practiceInput.focus({ preventScroll: true }), 70);
  }

  function setSentencePrompt(sentence) {
    ui.sentencePrompt.replaceChildren();
    const [before, after = ""] = sentence.split("___");
    ui.sentencePrompt.append(document.createTextNode(before));
    const blank = document.createElement("b");
    blank.textContent = "_____";
    ui.sentencePrompt.append(blank, document.createTextNode(after));
  }

  function submitPracticeAnswer(event) {
    event.preventDefault();
    const game = state.game;
    const item = currentPracticeItem();
    if (!game || !item || game.locked) return;
    const typed = normalizePracticeAnswer(ui.practiceInput.value);
    const expected = normalizePracticeAnswer(item.card.word);
    if (!typed) {
      ui.practiceFeedback.textContent = "先输入英文答案。";
      return;
    }
    if (typed === expected) return completePracticeWord(true);
    game.wrongAttempts += 1;
    game.firstAttempt = false;
    ui.miniMonster.classList.remove("miss");
    void ui.miniMonster.offsetWidth;
    ui.miniMonster.classList.add("miss");
    ui.practiceFeedback.className = "practice-feedback bad";
    if (game.wrongAttempts < 2) {
      ui.practiceFeedback.textContent = "还差一点，再检查标红的位置。";
      renderLetterGuide();
      ui.practiceInput.focus();
      return;
    }
    missPracticeWord();
  }

  function completePracticeWord(good) {
    const game = state.game;
    const item = currentPracticeItem();
    if (!game || !item || !good || game.locked) return;
    game.locked = true;
    game.correct += 1;
    if (game.firstAttempt && item.retry === 0) game.firstCorrect += 1;
    recordPracticeAnswer(item.card, true);
    ui.practiceFeedback.className = "practice-feedback good";
    ui.practiceFeedback.textContent = item.retry ? "已经记住，回练完成。" : "正确，击退成功。";
    ui.practiceInput.value = item.card.word;
    renderLetterGuide();
    ui.miniMonster.classList.remove("hit");
    void ui.miniMonster.offsetWidth;
    ui.miniMonster.classList.add("hit");
    speakPracticePrompt();
    setTimeout(advancePractice, game.mode === "sentence" ? 850 : 520);
  }

  function missPracticeWord() {
    const game = state.game;
    const item = currentPracticeItem();
    if (!game || !item || game.locked) return;
    game.locked = true;
    game.missed += 1;
    recordPracticeAnswer(item.card, false);
    if (item.retry < 1) {
      game.queue.push({ card: item.card, retry: item.retry + 1 });
      game.reviewIds.add(item.card.id);
    }
    ui.practiceInput.value = item.card.word;
    renderLetterGuide();
    ui.practiceFeedback.className = "practice-feedback bad";
    ui.practiceFeedback.textContent = `答案：${item.card.word}。本轮末尾会再出现一次。`;
    speakPracticePrompt();
    setTimeout(advancePractice, 1250);
  }

  function skipPracticeWord() {
    if (!state.game || !currentPracticeItem() || state.game.locked) return;
    state.game.firstAttempt = false;
    missPracticeWord();
  }

  function advancePractice() {
    if (!state.game) return;
    state.game.index += 1;
    renderPracticeQuestion();
  }

  function finishPractice() {
    const game = state.game;
    if (!game) return;
    const accuracy = Math.round(game.firstCorrect / Math.max(1, game.baseCount) * 100);
    state.practice.sessions += 1;
    state.practice.lastAt = new Date().toISOString();
    state.practice.lastMode = game.mode;
    const day = localDateKey(new Date());
    state.practice.daily[day] ||= { sessions: 0, correct: 0, missed: 0 };
    state.practice.daily[day].sessions += 1;
    state.practice.daily[day].correct += game.correct;
    state.practice.daily[day].missed += game.missed;
    state.practice.cardDays ||= {};
    const cardDay = game.cardDay || state.selectedDay;
    state.practice.cardDays[cardDay] ||= { sessions: 0, correct: 0, missed: 0 };
    state.practice.cardDays[cardDay].sessions += 1;
    state.practice.cardDays[cardDay].correct += game.correct;
    state.practice.cardDays[cardDay].missed += game.missed;
    savePracticeRecords();
    $("#resultAccuracy").textContent = `${accuracy}%`;
    $("#resultCorrect").textContent = String(game.correct);
    $("#resultReview").textContent = String(game.reviewIds.size);
    $("#resultMessage").textContent = game.reviewIds.size
      ? `${game.reviewIds.size} 个不熟的词已经在本轮末尾重新练习。以后仍可重新选择这个日期继续。`
      : "这一轮没有遗漏；可以直接结束，也可以选择其他日期或切换玩法。";
    $("#practiceProgressBar").style.width = "100%";
    showPracticePanel("result");
    renderPracticeEntry();
  }

  function renderLetterGuide() {
    const item = currentPracticeItem();
    if (!item) return ui.letterGuide.replaceChildren();
    const target = item.card.word;
    const typed = ui.practiceInput.value;
    ui.letterGuide.replaceChildren();
    [...target].forEach((char, index) => {
      const span = document.createElement("span");
      const inputChar = typed[index] || "";
      span.textContent = char === " " ? "  " : "•";
      if (inputChar && inputChar.toLowerCase() === char.toLowerCase()) span.className = "matched";
      else if (inputChar) span.className = "wrong";
      ui.letterGuide.append(span);
    });
  }

  function speakPracticePrompt() {
    const game = state.game;
    const item = currentPracticeItem();
    if (!game || !item || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const text = game.mode === "sentence" && game.sentence ? game.sentence.spoken : item.card.word;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = .78;
    speechSynthesis.speak(utterance);
  }

  function usePracticeHint() {
    const game = state.game;
    const item = currentPracticeItem();
    if (!game || !item || game.mode !== "sentence" || game.locked || game.hintLevel >= 3) return;
    const before = hintedWord(item.card.word, game.hintLevel);
    game.hintLevel += 1;
    game.hintsUsed += 1;
    const after = hintedWord(item.card.word, game.hintLevel);
    const added = [...after].filter((char, index) => /[a-z]/i.test(char) && char !== before[index]).length;
    ui.practiceWordHint.textContent = `${item.card.syllables || syllabify(item.card.word)} · ${after}`;
    ui.practiceHint.textContent = `提示 ${game.hintLevel}/3`;
    ui.practiceHint.disabled = game.hintLevel >= 3 || !after.includes("•");
    ui.practiceFeedback.className = "practice-feedback";
    ui.practiceFeedback.textContent = added
      ? `本次多显示 ${added} 个字母，还可提示 ${3 - game.hintLevel} 次。`
      : "这个词的字母已经全部显示。";
    ui.practiceInput.focus({ preventScroll: true });
  }

  function buildPracticeSentence(card, index) {
    const pos = inferPracticePart(card.meaning, card.word);
    const templates = {
      noun: ["We discussed ___ during today's class.", "Can you explain ___ in your own words?", "The lesson gave us a clear example of ___."],
      verb: ["We need to ___ this carefully before class ends.", "Please ___ the next step during the activity.", "They decided to ___ it after the discussion."],
      adjective: ["The teacher described the example as ___.", "The situation became ___ after the change.", "This is a very ___ idea."],
      adverb: ["She explained the answer ___.", "The class completed the task ___.", "He responded ___ to the question."],
      phrase: ["The expression ___ appeared in today's lesson.", "Please use ___ when you explain your answer.", "I wrote ___ in my class notes."],
      other: ["Today's key word is ___.", "I wrote ___ in my class notes.", "The teacher asked us to remember ___."],
    };
    const blank = templates[pos][index % templates[pos].length];
    return { blank, spoken: blank.replace("___", card.word) };
  }

  function inferPracticePart(meaning, word) {
    if (String(word).trim().includes(" ")) return "phrase";
    const value = String(meaning).trim().toLowerCase();
    if (/^(n\.|n\s|名词|\[名)/.test(value)) return "noun";
    if (/^(v\.|vt\.|vi\.|verb|动词|\[动)/.test(value)) return "verb";
    if (/^(adj\.|a\.|adjective|形容词|\[形)/.test(value)) return "adjective";
    if (/^(adv\.|adverb|副词|\[副)/.test(value)) return "adverb";
    const chinese = value.split(/[；;,，]/)[0].trim();
    if (chinese.endsWith("地")) return "adverb";
    if (chinese.endsWith("的")) return "adjective";
    if (/^(处理|讨论|解释|完成|使用|学习|记住|改变|帮助|提高|减少|增加|选择|决定|建立|保护|支持|发展|包括|产生|提供|允许|要求|尝试|解决|确认|描述|表达|保持|发现|了解|认识|认为|影响|控制)/.test(chinese)) return "verb";
    return "other";
  }

  function cleanPracticeMeaning(meaning) {
    return String(meaning || "释义待补充").replace(/^(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art)\.\s*/i, "").split(/[；;]/)[0].trim() || "释义待补充";
  }

  function maskedWord(word) {
    const chars = [...String(word)];
    const letters = chars.map((char, index) => {
      if (!/[a-z]/i.test(char)) return char;
      const first = chars.findIndex((item) => /[a-z]/i.test(item));
      let last = chars.length - 1;
      while (last >= 0 && !/[a-z]/i.test(chars[last])) last -= 1;
      return index === first || index === last ? char : "•";
    });
    return letters.join("");
  }

  function hintedWord(word, level) {
    const chars = [...String(word)];
    const letterIndexes = chars.map((char, index) => /[a-z]/i.test(char) ? index : -1).filter((index) => index >= 0);
    if (!letterIndexes.length) return String(word);
    const fixed = new Set([letterIndexes[0], letterIndexes[letterIndexes.length - 1]]);
    const candidates = letterIndexes.filter((index) => !fixed.has(index));
    candidates.slice(0, Math.min(candidates.length, level * 2)).forEach((index) => fixed.add(index));
    return chars.map((char, index) => !/[a-z]/i.test(char) || fixed.has(index) ? char : "•").join("");
  }

  function normalizePracticeAnswer(value) {
    return String(value).toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  }

  function practiceWordKey(card) { return normalizePracticeAnswer(card.word); }

  function recordPracticeAnswer(card, correct) {
    const key = practiceWordKey(card);
    state.practice.words[key] ||= { seen: 0, correct: 0, missed: 0, lastAt: null };
    const record = state.practice.words[key];
    record.seen += 1;
    if (correct) record.correct += 1;
    else record.missed += 1;
    record.lastAt = new Date().toISOString();
    state.practice.answered += 1;
    if (correct) state.practice.correct += 1;
    else state.practice.missed += 1;
    savePracticeRecords();
  }

  function loadPracticeRecords() {
    const empty = { sessions: 0, answered: 0, correct: 0, missed: 0, lastAt: null, lastMode: null, words: {}, daily: {}, cardDays: {} };
    try {
      const value = JSON.parse(localStorage.getItem(PRACTICE_KEY) || "null");
      return value && typeof value === "object" ? { ...empty, ...value, words: value.words || {}, daily: value.daily || {}, cardDays: value.cardDays || {} } : empty;
    } catch { return empty; }
  }

  function savePracticeRecords() {
    localStorage.setItem(PRACTICE_KEY, JSON.stringify(state.practice));
  }

  function renderAll() { renderLatest(); renderToday(); renderLibrary(); }
  function renderLatest() { renderCards(ui.latestCards, sortNewestBatchFirst(state.latest), { showBatches: true }); ui.latestEmpty.classList.toggle("hidden", state.latest.length > 0); }
  function renderToday() {
    const cards = getTodayCards();
    const label = displayDay(state.selectedDay);
    ui.selectedDayTitle.textContent = `${label}的单词`;
    ui.todaySummary.textContent = cards.length ? `${label}共 ${cards.length} 张卡片；新批次在前，重复词按出现次数计算。` : `${label}没有保存单词。`;
    renderDateControls();
    renderCards(ui.todayCards, cards, { showBatches: true });
    renderPracticeEntry();
  }
  function renderLibrary() {
    const query = ui.librarySearch.value.trim().toLowerCase();
    const cards = sortNewestBatchFirst(state.cards).filter((card) => !query || card.word.toLowerCase().includes(query) || card.meaning.includes(query));
    ui.librarySummary.textContent = `本机共保存 ${state.cards.length} 张卡片${query ? `，找到 ${cards.length} 张` : ""}`;
    renderCards(ui.libraryCards, cards);
  }

  function renderCards(container, cards, options = {}) {
    container.replaceChildren();
    const counts = new Map();
    cards.forEach((card) => counts.set(batchKey(card), (counts.get(batchKey(card)) || 0) + 1));
    let lastBatch = null, batchIndex = -1, indexInBatch = 0;
    cards.forEach((card, index) => {
      const currentBatch = batchKey(card);
      if (currentBatch !== lastBatch) {
        lastBatch = currentBatch; batchIndex += 1; indexInBatch = 0;
        if (options.showBatches) {
          const heading = document.createElement("div");
          heading.className = "batch-heading";
          heading.innerHTML = `<b>${batchIndex === 0 ? "最新一批" : `更早第 ${batchIndex + 1} 批`}</b><span>${counts.get(currentBatch)} 张</span>`;
          container.append(heading);
        }
      }
      const fragment = ui.template.content.cloneNode(true);
      const article = fragment.querySelector(".word-card");
      article.classList.toggle("needs-review", card.needsReview);
      fragment.querySelector(".sequence").textContent = String(options.showBatches ? indexInBatch + 1 : index + 1).padStart(2, "0");
      fragment.querySelector(".word").textContent = card.word;
      fragment.querySelector(".syllables").textContent = card.phonetic ? `${card.syllables}  /${card.phonetic}/` : card.syllables;
      fragment.querySelector(".meaning").textContent = card.meaning;
      fragment.querySelector(".source").textContent = card.source;
      fragment.querySelector(".confidence").textContent = card.needsReview ? "待确认" : card.origin === "photo" ? `${card.confidence}%` : "已生成";
      fragment.querySelector(".speak").addEventListener("click", () => speak(card.word));
      fragment.querySelector(".delete-card").addEventListener("click", () => removeCard(card.id));
      container.append(fragment);
      indexInBatch += 1;
    });
  }

  function removeCard(id) {
    state.cards = state.cards.filter((card) => card.id !== id);
    state.latest = state.latest.filter((card) => card.id !== id);
    saveCards();
    renderAll();
    toast("这张卡片已删除");
  }

  function speak(word) {
    if (!("speechSynthesis" in window)) return toast("当前浏览器不支持发音");
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = .82;
    speechSynthesis.speak(utterance);
  }

  function loadCards() {
    try { const value = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  }
  function saveCards() { localStorage.setItem(STORE_KEY, JSON.stringify(state.cards)); }
  function localDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return localDateKey(new Date());
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function dateFromKey(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date();
  }
  function displayDay(key) {
    const date = dateFromKey(key), today = localDateKey(new Date());
    if (key === today) return "今天";
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (key === localDateKey(yesterday)) return "昨天";
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  function availableDays() {
    return [...new Set(state.cards.map((card) => localDateKey(new Date(card.createdAt))))].sort();
  }
  function setSelectedDay(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return;
    const today = localDateKey(new Date());
    state.selectedDay = day > today ? today : day;
    renderToday();
  }
  function moveToRecordDay(direction) {
    const days = availableDays();
    const target = direction < 0 ? [...days].reverse().find((day) => day < state.selectedDay) : days.find((day) => day > state.selectedDay);
    if (target) setSelectedDay(target);
    else toast(direction < 0 ? "没有更早的单词记录" : "没有更新的单词记录");
  }
  function renderDateControls() {
    const today = localDateKey(new Date()), days = availableDays();
    ui.practiceDate.value = state.selectedDay;
    ui.practiceDate.max = today;
    $("#previousRecordDay").disabled = !days.some((day) => day < state.selectedDay);
    $("#nextRecordDay").disabled = !days.some((day) => day > state.selectedDay);
    $("#selectToday").disabled = state.selectedDay === today;
  }

  function eraseAll() {
    if (!confirm("确定删除这台设备上的全部单词卡片吗？此操作不能撤销。")) return;
    state.cards = []; state.latest = [];
    state.practice = { sessions: 0, answered: 0, correct: 0, missed: 0, lastAt: null, lastMode: null, words: {}, daily: {}, cardDays: {} };
    saveCards(); savePracticeRecords(); renderAll(); toast("本机学习记录已删除");
  }

  function setProgress(value, title, message, visible = true) {
    ui.scanPanel.classList.toggle("hidden", !visible);
    const bounded = Math.max(0, Math.min(100, Math.round(value)));
    ui.progressNumber.textContent = `${bounded}%`;
    ui.progressBar.style.width = `${bounded}%`;
    ui.scanTitle.textContent = title;
    ui.scanMessage.textContent = message;
  }

  function drawOverlay(items, sourceWidth, sourceHeight) {
    const canvas = ui.scanOverlay;
    const displayedWidth = ui.scanPreview.clientWidth || 1;
    const displayedHeight = displayedWidth * sourceHeight / sourceWidth;
    canvas.width = Math.round(displayedWidth * devicePixelRatio);
    canvas.height = Math.round(displayedHeight * devicePixelRatio);
    canvas.style.height = `${displayedHeight}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const sx = displayedWidth / sourceWidth, sy = displayedHeight / sourceHeight;
    ctx.lineWidth = 2;
    ctx.font = "700 11px -apple-system";
    items.forEach((item, index) => {
      const x = item.bbox.x0 * sx, y = item.bbox.y0 * sy;
      const width = (item.bbox.x1 - item.bbox.x0) * sx, height = (item.bbox.y1 - item.bbox.y0) * sy;
      ctx.strokeStyle = item.confidence < 62 ? "#ffb14a" : "#75aaff";
      ctx.fillStyle = "rgba(9,10,13,.82)";
      ctx.strokeRect(x, y, width, height);
      ctx.fillRect(x, Math.max(0, y - 16), 22, 16);
      ctx.fillStyle = "#fff";
      ctx.fillText(String(index + 1), x + 4, Math.max(11, y - 4));
    });
  }

  async function loadImageFile(file) {
    const objectUrl = URL.createObjectURL(file);
    const element = new Image();
    element.decoding = "async";
    const promise = new Promise((resolve, reject) => {
      element.onload = () => resolve({ element, objectUrl, revoke: () => URL.revokeObjectURL(objectUrl) });
      element.onerror = () => reject(new Error("浏览器无法读取这张照片。iPhone 上请保留原始 HEIC 或改用 JPEG。"));
    });
    element.src = objectUrl;
    return promise;
  }

  function drawScaledImage(image, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function canvasFromSource(source) {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = source; });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0);
    return canvas;
  }

  function readableError(error) { return error?.message || "请重新拍照后再试。"; }
  let toastTimer;
  function toast(message) {
    clearTimeout(toastTimer); ui.toast.textContent = message; ui.toast.classList.add("show");
    toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 2400);
  }
})();
