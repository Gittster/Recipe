let recipes = [];
let madeModalRecipe = '';
let currentTags = [];
let currentUser = null; // Global user tracker

function renderTags() {
  const tagsContainer = document.getElementById('tagsContainer');
  const placeholder = document.getElementById('tagsPlaceholder');
  if (!tagsContainer) return;

  tagsContainer.innerHTML = '';

  if (currentTags.length === 0) {
    if (placeholder) placeholder.style.display = 'block';
  } else {
    if (placeholder) placeholder.style.display = 'none';
  }

  currentTags.forEach(tag => {
    const tagBadge = document.createElement('span');
    tagBadge.className = 'badge bg-primary text-white me-1';
    tagBadge.textContent = tag;

    // Allow removing tags on click
    tagBadge.onclick = () => {
      currentTags = currentTags.filter(t => t !== tag);
      renderTags();
    };

    tagsContainer.appendChild(tagBadge);
  });
}

async function runDoctrOCR(base64Image) {
  const hfToken = "hf_XXXXXXXXXXXX"; // ⚠️ Never expose this directly in production
  const url = "https://api-inference.huggingface.co/models/mindee/doctr-end-to-end";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${hfToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: {
        image: base64Image
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error("API failed: " + error);
  }

  const result = await response.json();
  return result;
}

function handleOCRImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async function (e) {
    const base64Data = e.target.result.split(',')[1]; // Remove data:image prefix

    try {
      const response = await fetch("https://beamish-baklava-a99968.netlify.app/.netlify/functions/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ base64: base64Data })
      });

      const ocrResult = await response.json();
      console.log("🧠 OCR Result:", ocrResult);

      const parsed = extractRecipeFromDoctr(ocrResult);
      fillRecipeForm(parsed);
    } catch (err) {
      console.error("❌ OCR call failed:", err);
      alert("OCR failed — check the console for details.");
    }
  };

  reader.readAsDataURL(file);
}

function extractRecipeFromDoctr(response) {
  const blocks = response?.[0]?.pages?.[0]?.blocks || [];

  const lines = blocks.flatMap(block =>
    block.lines.map(line =>
      line.words.map(word => word.value).join(' ')
    )
  );

  const fullText = lines.join('\n');
  console.log("🔎 Extracted Text:", fullText);

  // 👇 Use your existing logic to parse the text into a recipe object
  return parseOcrToRecipeFields(fullText);
}


function clearAllPlanning(button) {
  if (button.parentElement.querySelector('.confirm-clear')) return;

  button.style.display = 'none';

  const confirmArea = document.createElement('div');
  confirmArea.className = 'confirm-clear d-flex gap-2 align-items-center';

  const confirmText = document.createElement('span');
  confirmText.textContent = 'Delete ALL planned meals?';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'btn btn-sm btn-outline-danger';
  yesBtn.textContent = 'Yes';
  yesBtn.onclick = () => {
    db.collection("planning")
    .where('uid', '==', currentUser.uid)
    .get()
    .then(snapshot => {
      const batch = db.batch();
      snapshot.forEach(doc => batch.delete(doc.ref));
      return batch.commit();
    }).then(() => {
      console.log("✅ All planning cleared.");
      showPlanning(); // ✅ FULL re-render the Planning screen
    }).catch(err => {
      console.error("❌ Error clearing planning:", err);
      confirmArea.remove();
      button.style.display = '';
    });
  };

  const noBtn = document.createElement('button');
  noBtn.className = 'btn btn-sm btn-outline-dark';
  noBtn.textContent = 'No';
  noBtn.onclick = () => {
    confirmArea.remove();
    button.style.display = '';
  };

  confirmArea.appendChild(confirmText);
  confirmArea.appendChild(yesBtn);
  confirmArea.appendChild(noBtn);

  button.parentElement.appendChild(confirmArea);
}

async function loadRecipes() {
  const res = await fetch('recipes.json');
  recipes = await res.json();
  showRecipeFilter();
}

function showRecipeFilter() {
  const view = document.getElementById('mainView');
  view.className = 'section-recipes';
  view.innerHTML = `
  <h5 class="mb-3">📚 Recipes</h5>

  <input type="text" class="form-control mb-2" id="recipeSearch" placeholder="Filter by ingredient..." oninput="filterRecipesByText()" />
  <input type="text" class="form-control mb-2" id="tagSearch" placeholder="Filter by tag..." oninput="filterRecipesByTag()" />


  <button class="btn btn-outline-primary mb-3" onclick="toggleRecipeForm()">Add Recipe</button>

  <div id="recipeForm" class="collapsible-form mb-4">
    <div class="card card-body">

      <!-- Manual Entry -->
      <label class="form-label fw-semibold">📛 Recipe Name</label>
      <input class="form-control mb-3" id="recipeNameInput" placeholder="Recipe name" />


      <div class="mb-3">
        <label class="form-label fw-semibold mt-3">🧂 Ingredients</label>
        <div id="ingredientsTable"></div>
      </div>

      <label class="form-label fw-semibold mt-3">📝 Instructions</label>
      <textarea class="form-control mb-3" id="recipeInstructionsInput" rows="4" placeholder="Instructions"></textarea>


      <label class="form-label fw-semibold mt-3">🏷️ Tags</label>
      <div class="mb-3">
        <div id="tagsContainer" class="form-control d-flex flex-wrap align-items-center gap-2 p-2 position-relative" style="min-height: 45px; background-color: #f8f9fa; border: 1px dashed #ced4da;">
          <span id="tagsPlaceholder" class="text-muted position-absolute" style="left: 10px; top: 8px; pointer-events: none;">Add some tags...</span>
        </div>
        <div class="d-flex flex-nowrap gap-2 mt-2">
          <input type="text" id="tagInput" class="form-control" placeholder="Type a tag" style="flex: 1; min-width: 0;" />
          <button type="button" id="tagAddButton" class="btn btn-outline-dark btn-sm flex-shrink-0" style="min-width: 90px;">Add Tag</button>
        </div>
      </div>


      <hr class="my-3" style="border-top: 2px solid #ccc;" />

      <div class="d-flex gap-2 mb-4">
        <button class="btn btn-outline-primary" onclick="saveRecipe()">Add Recipe</button>
        <button class="btn btn-outline-dark" onclick="toggleRecipeForm()">Cancel</button>
      </div>

      <!-- ➕ OCR + Paste Cards -->
      <div class="accordion" id="addRecipeOptionsAccordion">

        <!-- 📸 OCR Section -->
        <div class="accordion-item">
          <h2 class="accordion-header" id="headingOCR">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOCR" aria-expanded="false" aria-controls="collapseOCR">
              📸 Add Recipe by Photo
            </button>
          </h2>
          <div id="collapseOCR" class="accordion-collapse collapse" aria-labelledby="headingOCR" data-bs-parent="#addRecipeOptionsAccordion">
            <div class="accordion-body">
              <label for="recipePhotoInput" class="form-label">Upload or Take a Recipe Photo</label>
              <input
                type="file"
                id="recipePhotoInput"
                accept="image/*"
                capture="environment"
                class="form-control mb-3"
                onchange="handleRecipePhoto(event)"
              />
              <div id="photoPreviewContainer" class="mb-3"></div>
            </div>
          </div>
        </div>

        <!-- ⌨️ Paste Text Section -->
        <div class="accordion-item">
          <h2 class="accordion-header" id="headingPaste">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapsePaste" aria-expanded="false" aria-controls="collapsePaste">
              ⌨️ Add Recipe by Pasting Text
            </button>
          </h2>
          <div id="collapsePaste" class="accordion-collapse collapse" aria-labelledby="headingPaste" data-bs-parent="#addRecipeOptionsAccordion">
            <div class="accordion-body">
              <label for="ocrTextPaste" class="form-label">Paste your recipe name, ingredients, and instructions below the dashed lines.</label>
              <textarea id="ocrTextPaste" class="form-control mb-2" rows="10">
📛 RECIPE NAME
====================


🧂 INGREDIENTS
====================


📝 INSTRUCTIONS
====================


</textarea>

              <button class="btn btn-sm btn-outline-primary" onclick="handlePastedRecipeText()">✨ Parse Text to Fill Form</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>


  <div id="recipeResults"></div>
`;

  displayRecipes(recipes, 'recipeResults');

  // Attach event handler to the Add Tag button
const tagInput = document.getElementById('tagInput');
const tagAddButton = document.getElementById('tagAddButton');
if (tagAddButton) {
  tagAddButton.onclick = () => {
    const value = tagInput.value.trim().toLowerCase();
    if (value && !currentTags.includes(value)) {
      currentTags.push(value);
      renderTags();
    }
    tagInput.value = '';
  };
}

}

function handlePastedRecipeText() {
  const textarea = document.getElementById('ocrTextPaste');
  if (!textarea) return;

  const text = textarea.value.trim();
  if (!text) {
    alert("Please paste a recipe first.");
    return;
  }

  const parsed = parseOcrToRecipeFields(text);
  fillRecipeForm(parsed);
}

function normalizeFractions(text) {
  return text
    .replace(/½/g, '1/2')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3')
    .replace(/¼/g, '1/4')
    .replace(/¾/g, '3/4')
    .replace(/⅕/g, '1/5')
    .replace(/⅖/g, '2/5')
    .replace(/⅗/g, '3/5')
    .replace(/⅘/g, '4/5')
    .replace(/⅙/g, '1/6')
    .replace(/⅚/g, '5/6')
    .replace(/⅛/g, '1/8')
    .replace(/⅜/g, '3/8')
    .replace(/⅝/g, '5/8')
    .replace(/⅞/g, '7/8');
}



function createIngredientRow(name = '', qty = '', unit = '') {
  const row = document.createElement('div');
  row.className = 'row g-2 align-items-center mb-2';

  const nameCol = document.createElement('div');
  nameCol.className = 'col-6';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Ingredient';
  nameInput.className = 'form-control';
  nameInput.value = name;
  nameCol.appendChild(nameInput);

  const qtyCol = document.createElement('div');
  qtyCol.className = 'col-2 position-relative d-flex align-items-center';
  const qtyInput = document.createElement('input');
  qtyInput.type = 'text';
  qtyInput.placeholder = 'Qty';
  qtyInput.className = 'form-control';
  qtyInput.value = qty;
  qtyCol.appendChild(qtyInput);

  const unitCol = document.createElement('div');
  unitCol.className = 'col-3';
  const unitInput = document.createElement('input');
  unitInput.type = 'text';
  unitInput.placeholder = 'Unit';
  unitInput.className = 'form-control';
  unitInput.value = unit;
  unitCol.appendChild(unitInput);

  // ✅ Delete column (1 col wide)
  const deleteCol = document.createElement('div');
  deleteCol.className = 'col-1 d-flex justify-content-center align-items-center';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-sm btn-outline-danger';
  deleteBtn.innerHTML = '🗑️';
  deleteBtn.title = 'Remove this ingredient';

  deleteBtn.onclick = () => {
    row.remove();
  };

  deleteCol.appendChild(deleteBtn);

  // Assemble row
  row.appendChild(nameCol);
  row.appendChild(qtyCol);
  row.appendChild(unitCol);
  row.appendChild(deleteCol);

  document.getElementById('ingredientsTable').appendChild(row);

  // Add new blank row when the last one is filled
  [nameInput, qtyInput, unitInput].forEach(input => {
    input.addEventListener('input', () => {
      const isLastRow = row === document.getElementById('ingredientsTable').lastElementChild;
      const filled = nameInput.value && qtyInput.value && unitInput.value;
      if (isLastRow && filled) createIngredientRow();
    });
  });
}


function filterRecipesByTag() {
  const search = document.getElementById('tagSearch').value.trim().toLowerCase();
  const tagTerms = search.split(',').map(t => t.trim()).filter(Boolean);

  if (tagTerms.length === 0) {
    displayRecipes(recipes);
    return;
  }

  const filtered = recipes.filter(recipe => {
    if (!recipe.tags) return false;

    const recipeTags = recipe.tags.map(tag => tag.toLowerCase());

    // ✅ ALL search tags must match at least once
    return tagTerms.every(term =>
      recipeTags.some(tag => tag.startsWith(term))
    );
  });

  displayRecipes(filtered, 'recipeResults', { highlightTags: tagTerms });
}



function handleRecipePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  const preview = document.getElementById('photoPreviewContainer');
  const reader = new FileReader();

  reader.onload = function (e) {
    const img = document.createElement('img');
    img.src = e.target.result;
    img.className = 'img-fluid rounded border';
    img.alt = 'Recipe Photo Preview';
    preview.innerHTML = '';
    preview.appendChild(img);
  
    img.onload = async () => {
      const container = document.getElementById('photoPreviewContainer');
      container.innerHTML = ''; // Clear previous content
    
      // ➤ Original Image
      const originalLabel = document.createElement('p');
      originalLabel.textContent = "📷 Original Photo";
      const originalImg = document.createElement('img');
      originalImg.src = img.src;
      originalImg.style.maxWidth = "45%";
      originalImg.style.marginRight = "5%";
    
      // ➤ Preprocessed Image
      const processedLabel = document.createElement('p');
      processedLabel.textContent = "🧼 Preprocessed Image";
      const processedDataUrl = preprocessImage(img); // canvas.toDataURL()
      const processedImg = document.createElement('img');
      processedImg.src = processedDataUrl;
      processedImg.style.maxWidth = "45%";
    
      // Add both images and labels side-by-side
      const labelRow = document.createElement('div');
      labelRow.style.display = 'flex';
      labelRow.style.justifyContent = 'space-between';
      labelRow.appendChild(originalLabel);
      labelRow.appendChild(processedLabel);
    
      const imgRow = document.createElement('div');
      imgRow.style.display = 'flex';
      imgRow.style.justifyContent = 'space-between';
      imgRow.appendChild(originalImg);
      imgRow.appendChild(processedImg);
    
      container.appendChild(labelRow);
      container.appendChild(imgRow);
    
      // ➤ Run OCR on preprocessed image
      Tesseract.recognize(
        processedDataUrl,
        'eng',
        {
          logger: m => console.log(m),
          config: {
            tessedit_pageseg_mode: '6'
          }
        }
      ).then(({ data: { text } }) => {
        const editorLabel = document.createElement('p');
      editorLabel.textContent = "📝 Editable OCR Text";

      const structuredText = generateStructuredOcrTemplate(text);
      const result = document.createElement('textarea');
      result.value = structuredText;
      result.rows = 12;
      result.className = 'form-control mt-2 font-monospace';
      result.style.whiteSpace = 'pre-wrap';


      // ✅ Add ID so we can reference it
      result.id = 'ocrTextArea';

      // ✅ Add parse button
      const parseBtn = document.createElement('button');
      parseBtn.className = 'btn btn-info btn-sm btn-outline-dark mt-2';
      parseBtn.textContent = '✨ Parse OCR Text to Fill Form';

      parseBtn.onclick = () => {
        const updatedText = document.getElementById('ocrTextArea').value;
        const parsed = parseOcrToRecipeFields(updatedText);
        fillRecipeForm(parsed);
      };

      container.appendChild(editorLabel);
      container.appendChild(result);
      container.appendChild(parseBtn);


      }).catch(err => {
        const errorMsg = document.createElement('p');
        errorMsg.textContent = '❌ OCR failed.';
        container.appendChild(errorMsg);
        console.error("OCR error:", err);
      });
    };
    
    
    
  };  

  reader.readAsDataURL(file);
}

function generateStructuredOcrTemplate(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  let title = '';
  const ingredients = [];
  const instructions = [];

  let inIngredients = false;
  let inInstructions = false;

  lines.forEach((line, idx) => {
    const lower = line.toLowerCase();

    if (!title) {
      title = line;
      return;
    }

    if (lower.includes('ingredient')) {
      inIngredients = true;
      inInstructions = false;
      return;
    }

    if (lower.includes('instruction') || lower.includes('method') || lower.includes('directions')) {
      inIngredients = false;
      inInstructions = true;
      return;
    }

    if (inIngredients) {
      ingredients.push(line);
    } else if (inInstructions) {
      instructions.push(line);
    }
  });

  return [
    '📛 RECIPE NAME',
    '====================',
    title,
    '',
    '🧂 INGREDIENTS',
    '====================',
    ingredients.join('\n') || '(none found)',
    '',
    '📝 INSTRUCTIONS',
    '====================',
    instructions.join('\n') || '(none found)'
  ].join('\n');
  
}

function deleteHistoryEntry(entryId, cardElement) {
  if (!confirm("Are you sure you want to delete this history entry?")) return;

  db.collection('history').doc(entryId).delete()
    .then(() => {
      console.log('✅ History entry deleted:', entryId);
      cardElement.remove(); // Instantly remove from the view
    })
    .catch((err) => {
      console.error('❌ Failed to delete history entry:', err);
      alert('Failed to delete history entry.');
    });
}


function markAsMade(recipeName, buttonElement) {
  console.log("✅ Mark as Made clicked for:", recipeName);

  const card = buttonElement.closest('.card');
  if (!card) return;

  // Prevent multiple open forms
  if (card.querySelector('.mark-made-form')) return;

  const form = document.createElement('div');
  form.className = 'mark-made-form mt-3 p-2 border rounded bg-light';

  const textarea = document.createElement('textarea');
  textarea.className = 'form-control mb-2';
  textarea.rows = 2;
  textarea.placeholder = 'Optional comment...';

  // 💾 Save button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-outline-dark btn-sm';
  saveBtn.innerHTML = '💾 Save';

  // ❌ Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-outline-danger btn-sm';
  cancelBtn.innerHTML = '❌ Cancel';

  // 📅 Made Date label
  const dateLabel = document.createElement('label');
  dateLabel.textContent = 'Made date:';
  dateLabel.className = 'form-label mb-0 ms-3 fw-semibold';
  dateLabel.style.whiteSpace = 'nowrap';

  // 🗓️ Date picker
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'form-control form-control-sm';
  dateInput.style.maxWidth = '150px';

  // Default to today
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;

  // ➕ Controls container
  const controls = document.createElement('div');
  controls.className = 'd-flex align-items-center gap-2 flex-wrap';

  controls.appendChild(saveBtn);
  controls.appendChild(cancelBtn);
  controls.appendChild(dateLabel);
  controls.appendChild(dateInput);

  // 💾 Save logic
  saveBtn.onclick = () => {
    const notes = textarea.value.trim();
    const timestamp = new Date(dateInput.value).toISOString();
  
    // 🔥 Find the full recipe object
    const recipeObj = recipes.find(r => r.name === recipeName);
  
    db.collection("history").add({
      recipe: recipeName,
      tags: recipeObj?.tags || [], // ✅ Save tags too!
      timestamp: timestamp,
      notes: notes || '',
      uid: currentUser.uid
    }).then(() => {
      console.log("✅ History entry added!");
      form.innerHTML = '<div class="text-success fw-bold">✅ Marked as made!</div>';
      setTimeout(() => form.remove(), 2000);
    }).catch(err => {
      console.error("❌ Failed to save history:", err);
      alert('Failed to save history.');
    });
  };
  

  // ❌ Cancel logic
  cancelBtn.onclick = () => form.remove();

  form.appendChild(textarea);
  form.appendChild(controls);
  card.appendChild(form);
}






function fillRecipeForm(recipe) {
  const nameInput = document.getElementById('recipeNameInput');
  const instructionsInput = document.getElementById('recipeInstructionsInput');
  const ingredientsTable = document.getElementById('ingredientsTable');

  if (nameInput) nameInput.value = recipe.title || '';
  if (instructionsInput) instructionsInput.value = recipe.instructions || '';

  if (ingredientsTable) {
    ingredientsTable.innerHTML = '';
    recipe.ingredients.forEach(i => {
      createIngredientRow(i.name, i.quantity, i.unit);
    });
    createIngredientRow(); // Add blank row at end
  }
}


function stripBase64Header(dataUrl) {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '');
}


function runOCRFromImage(src) {
  const preview = document.getElementById('photoPreviewContainer');
  preview.innerHTML = ''; // Clear any previous content

  const status = document.createElement('p');
  status.textContent = '🔍 Scanning text...';
  preview.appendChild(status);

  Tesseract.recognize(src, 'eng', {
    logger: m => console.log(m),
    config: {
      tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:,.()/- ',
      tessedit_pageseg_mode: '13'
    }
  }).then(({ data: { text } }) => {
    status.remove();

    // 📝 Textarea for editable OCR result
    const textarea = document.createElement('textarea');
    textarea.className = 'form-control mb-2';
    textarea.id = 'ocrTextArea';
    textarea.rows = 10;
    textarea.value = text;
    preview.appendChild(textarea);

    // 🔘 Button to parse the editable OCR result
    const parseBtn = document.createElement('button');
    parseBtn.className = 'btn btn-info btn-sm btn-outline-dark mt-2';
    parseBtn.textContent = '✨ Parse OCR Text to Fill Form';

    parseBtn.onclick = () => {
      const updatedText = document.getElementById('ocrTextArea').value;
      const parsed = parseOcrToRecipeFields(updatedText);
      fillRecipeForm(parsed);
    };
    console.log("✅ OCR Parse button being added!");
    preview.appendChild(parseBtn);
  }).catch(err => {
    console.error("OCR error:", err);
    status.textContent = '❌ OCR failed.';
  });
}



function preprocessImage(img) {
  const canvas = document.getElementById('preprocessCanvas');
  const ctx = canvas.getContext('2d');

  const scaleFactor = 2;
  const width = img.naturalWidth * scaleFactor;
  const height = img.naturalHeight * scaleFactor;

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Parameters to tweak
  const brightness = 1.1; // Lighten slightly
  const contrast = 1.1;   // Gentle boost

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];

    // Convert to grayscale
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;

    // Apply brightness and contrast adjustment
    gray = ((gray - 128) * contrast + 128) * brightness;

    // Clamp to 0–255 range
    gray = Math.max(0, Math.min(255, gray));

    // Apply grayscale to all color channels
    data[i] = data[i + 1] = data[i + 2] = gray;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}


function parseOcrToRecipeFields(ocrText) {
  // 🧼 Normalize Unicode fractions
  ocrText = normalizeFractions(ocrText);

  const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l);

  const recipe = {
    title: '',
    ingredients: [],
    instructions: ''
  };

  // ... rest unchanged ...


  let inIngredients = false;
  let inInstructions = false;
  const instructionLines = [];

  const knownUnits = new Set([
    'teaspoon', 'teaspoons', 'tsp',
    'tablespoon', 'tablespoons', 'tbsp',
    'cup', 'cups',
    'oz', 'ounce', 'ounces',
    'lb', 'pound', 'pounds',
    'clove', 'cloves',
    'stick', 'sticks',
    'gram', 'grams', 'g',
    'kg', 'ml', 'l',
    'pinch', 'dash', 'can', 'cans', 'package', 'packages',
    'slice', 'slices', 'bunch', 'bunches'
  ]);
  

  lines.forEach(line => {
    const lower = line.toLowerCase();
    // ✅ Skip decorative divider lines like ============
    if (/^=+$/.test(line)) return;

    // ✅ Section switching — keep these to set flags
    if (lower.includes('ingredient') || lower.includes('🧂')) {
      inIngredients = true;
      inInstructions = false;
      return;
    }

    if (
      lower.includes('instruction') ||
      lower.includes('method') ||
      lower.includes('directions') ||
      lower.includes('📝')
    ) {
      inInstructions = true;
      inIngredients = false;
      return;
    }

    if (lower.includes('📛')) {
      return;
    }

    if (!recipe.title) {
      recipe.title = line;
      return;
    }

    if (inIngredients) {
      const match = line.match(/^(\d+\s\d\/\d|\d+\/\d|\d+(?:\.\d+)?)?\s*([a-zA-Z]+)?\s+(.+)$/);
      if (match) {
        const qty = (match[1] || '').trim();
        let unit = (match[2] || '').trim().toLowerCase();
        let name = (match[3] || '').trim();
    
        // ✅ If the "unit" isn't a known unit, treat it as part of the name
        if (!knownUnits.has(unit)) {
          name = `${unit} ${name}`.trim(); // prepend unit into name
          unit = qty ? 'whole' : ''; // fallback unit
        }

         // ✅ Log the result for debug
          console.log('🔍 Parsed Ingredient Line:', {
            original: line,
            quantity: qty,
            unit: unit,
            name: name
          });
    
        if (name) {
          recipe.ingredients.push({
            name,
            quantity: qty || '',
            unit
          });
        }
      }
    }
     

    if (inInstructions) {
      instructionLines.push(line);
    }
  });

  recipe.instructions = instructionLines.join(' ').trim();
  return recipe;
}





function saveRecipe() {
  const name = document.getElementById('recipeNameInput').value.trim();
  const instructions = document.getElementById('recipeInstructionsInput').value.trim();

  const rows = document.querySelectorAll('#ingredientsTable > .row');
  const ingredients = [];

  const tags = currentTags || [];

  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const name = inputs[0]?.value.trim();
    const qty = inputs[1]?.value.trim();
    const unit = inputs[2]?.value.trim();

    if (name) { // ✅ Only require name
      ingredients.push({
        name,
        quantity: qty || '',
        unit: unit || ''
      });
    }
    
  });

  if (!name || ingredients.length === 0) {
    const error = document.createElement('div');
    error.id = 'recipeErrorMessage';
    error.className = 'alert alert-danger mt-2';
    error.textContent = "Please provide a recipe name and at least one ingredient.";
    const form = document.getElementById('recipeForm');
    form.querySelector('.card-body').appendChild(error);
    return;
  }

  if (!currentUser) {
    alert('⚠️ You must be signed in to save a recipe.');
    return;
  }

  const recipe = {
    name,
    instructions,
    ingredients,
    tags,
    timestamp: new Date(),
    uid: currentUser.uid // 🔥 THIS MUST BE INCLUDED
  };

  console.log(recipe); 
  db.collection('recipes').add(recipe)
    .then(docRef => {
      console.log("✅ Recipe added with ID:", docRef.id);
      toggleRecipeForm(); // Hide form
      showSuccessMessage("✅ Recipe saved successfully!");
      loadRecipesFromFirestore(); // Reload recipes
      currentTags = []; // Clear tags
    })
    .catch(error => {
      console.error("❌ Error adding recipe:", error.message || error);
    });
}


function showSuccessMessage(message) {
  const view = document.getElementById('mainView');
  
  const successAlert = document.createElement('div');
  successAlert.className = 'alert alert-success text-center position-fixed top-0 start-50 translate-middle-x mt-3';
  successAlert.style.zIndex = 1000;
  successAlert.style.width = '90%';
  successAlert.style.maxWidth = '400px';
  successAlert.textContent = message;

  document.body.appendChild(successAlert);

  setTimeout(() => {
    successAlert.remove();
  }, 3000); // disappear after 3 seconds
}



function toggleRecipeForm() {
  const form = document.getElementById('recipeForm');
  if (!form) return;

  const isNowOpen = form.classList.toggle('open');

  const nameInput = document.getElementById('recipeNameInput');
  const ingredientsTable = document.getElementById('ingredientsTable');
  const instructionsInput = document.getElementById('recipeInstructionsInput');

  if (isNowOpen) {
    // ✅ When opening, clear old values and set up grid
    if (nameInput) nameInput.value = '';
    if (instructionsInput) instructionsInput.value = '';
    if (ingredientsTable) {
      ingredientsTable.innerHTML = '';
      createIngredientRow();
    }

    const tagInput = document.getElementById('tagInput');
    const tagsContainer = document.getElementById('tagsContainer');

    if (tagInput && tagsContainer) {
      tagInput.value = '';
      tagsContainer.innerHTML = '';

      tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const value = tagInput.value.trim().toLowerCase();
          if (value && !currentTags.includes(value)) {
            currentTags.push(value);
            renderTags();
          }
          tagInput.value = '';
        }
      });
    }

    const preview = document.getElementById('photoPreviewContainer');
    if (preview) preview.innerHTML = '';
  } else {
    // Optional cleanup when hiding
    if (ingredientsTable) ingredientsTable.innerHTML = '';
  }
}



function showRandomRecipe() {
  const view = document.getElementById('mainView');

  if (recipes.length === 0) {
    view.innerHTML = "<p>No recipes available.</p>";
    return;
  }

  const randomIndex = Math.floor(Math.random() * recipes.length);
  const randomRecipe = recipes[randomIndex];

  view.innerHTML = `
    <h5 class="mb-3">🎲 Random Recipe</h5>
    <div id="randomRecipeCard"></div>
  `;

  displayRecipes([randomRecipe], 'randomRecipeCard');
}


function viewHistory() {
  const view = document.getElementById('mainView');
  view.className = 'section-history';
  view.innerHTML = `
    <h5 class="mb-3">🕘 Recipe History</h5>

    <input type="text" class="form-control mb-2" id="historySearch" placeholder="Search notes or recipe name..." oninput="filterHistory()" />
    <input type="text" class="form-control mb-3" id="historyTagSearch" placeholder="Filter by tag..." oninput="filterHistory()" />

    <div id="historyList">Loading...</div>
  `;


  db.collection("history")
  .where('uid', '==', currentUser.uid)
  .orderBy('timestamp', 'desc')
  .get().then(snapshot => {
    const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderHistoryList(history);
  }).catch(err => {
    console.error("Error loading history:", err);
    document.getElementById('historyList').innerHTML = '<p>Error loading history</p>';
  });
}


function renderHistoryList(entries, highlightTags = []) {
  const container = document.getElementById('historyList');
  container.innerHTML = '';

  if (entries.length === 0) {
    container.innerHTML = '<p>No history found.</p>';
    return;
  }

  entries.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'card mb-3 shadow-sm';

    const body = document.createElement('div');
    body.className = 'card-body d-flex justify-content-between align-items-start';

    const textArea = document.createElement('div');

    const tagHtml = (entry.tags && entry.tags.length > 0)
      ? `
        <div class="mb-2">
          <strong>Tags:</strong><br />
          ${entry.tags.map(tag => {
            const lowerTag = tag.toLowerCase();
            const isHighlighted = highlightTags.includes(lowerTag);
            const badgeClass = isHighlighted
              ? 'badge bg-warning text-dark me-1 mt-1'
              : 'badge bg-primary text-white me-1 mt-1';
            return `<span class="${badgeClass}">${tag}</span>`;
          }).join('')}
        </div>
      `
      : '';

    textArea.innerHTML = `
      <h5 class="card-title">${entry.recipe}</h5>
      <p><strong>Date:</strong> ${new Date(entry.timestamp).toLocaleDateString()}</p>
      ${tagHtml}
      <p><strong>Notes:</strong> ${entry.notes || '(No notes)'}</p>
    `;

    const deleteArea = document.createElement('div');
    deleteArea.className = 'delete-area';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-outline-danger btn-sm flex-shrink-0';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete entry';
    deleteBtn.onclick = () => confirmDeleteHistory(entry.id, deleteArea, card);

    deleteArea.appendChild(deleteBtn);

    body.appendChild(textArea);
    body.appendChild(deleteArea);
    card.appendChild(body);
    container.appendChild(card);
  });
}




function filterHistory() {
  const query = document.getElementById('historySearch').value.toLowerCase();
  const tagSearch = document.getElementById('historyTagSearch').value.toLowerCase();
  const tagTerms = tagSearch.split(',').map(t => t.trim()).filter(Boolean);

  db.collection("history")
    .where("uid", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .get()
    .then(snapshot => {
      const allEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const filtered = allEntries.filter(entry => {
        const matchesText = !query || (
          entry.recipe.toLowerCase().includes(query) ||
          (entry.notes && entry.notes.toLowerCase().includes(query))
        );

        const entryTags = (entry.tags || []).map(t => t.toLowerCase());
        const matchesTags = tagTerms.length === 0 || tagTerms.every(term =>
          entryTags.some(tag => tag.startsWith(term))
        );

        return matchesText && matchesTags;
      });

      renderHistoryList(filtered, tagTerms);
    });
}


function confirmDeleteHistory(entryId, deleteArea, cardElement) {
  if (deleteArea.querySelector('.confirm-delete')) return;

  deleteArea.innerHTML = '';

  const confirmArea = document.createElement('div');
  confirmArea.className = 'confirm-delete d-flex align-items-center gap-2';

  // Styled confirm text
  const confirmText = document.createElement('span');
  confirmText.className = 'fw-semibold text-danger';
  confirmText.textContent = 'Confirm?';

  // ✅ Confirm button
  const yesBtn = document.createElement('button');
  yesBtn.className = 'btn btn-sm btn-outline-success';
  yesBtn.innerHTML = '✅';
  yesBtn.title = 'Confirm delete';
  yesBtn.onclick = () => {
    db.collection('history').doc(entryId).delete()
      .then(() => {
        console.log('✅ History entry deleted:', entryId);
        cardElement.remove();
      })
      .catch((err) => {
        console.error('❌ Failed to delete history entry:', err);
        alert('Failed to delete entry.');
        deleteArea.innerHTML = '';
      });
  };

  // ❌ Cancel button
  const noBtn = document.createElement('button');
  noBtn.className = 'btn btn-sm btn-outline-danger';
  noBtn.innerHTML = '❌';
  noBtn.title = 'Cancel';
  noBtn.onclick = () => {
    deleteArea.innerHTML = '';
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn btn-outline-danger btn-sm flex-shrink-0';
    restoreBtn.innerHTML = '🗑️';
    restoreBtn.title = 'Delete entry';
    restoreBtn.onclick = () => confirmDeleteHistory(entryId, deleteArea, cardElement);
    deleteArea.appendChild(restoreBtn);
  };

  confirmArea.appendChild(confirmText);
  confirmArea.appendChild(yesBtn);
  confirmArea.appendChild(noBtn);
  deleteArea.appendChild(confirmArea);
}



function populateIngredientSelect() {
  const allIngredients = [...new Set(recipes.flatMap(r => r.ingredients))].sort();
  const select = document.getElementById('ingredientSelect');
  select.innerHTML = '';
  allIngredients.forEach(ing => {
    const opt = document.createElement('option');
    opt.value = ing;
    opt.textContent = ing;
    select.appendChild(opt);
  });
}

function filterRecipesByText() {
  const search = document.getElementById('recipeSearch').value.trim().toLowerCase();
  const searchTerms = search.split(',').map(s => s.trim()).filter(Boolean);

  if (searchTerms.length === 0) {
    displayRecipes(recipes);
    return;
  }

  const filtered = recipes.filter(recipe => {
    if (!recipe.ingredients) return false;

    const ingredientNames = recipe.ingredients.map(ing => 
      typeof ing === 'object' ? ing.name.toLowerCase() : ing.toLowerCase()
    );

    // ✅ ALL search terms must match at least once
    return searchTerms.every(term =>
      ingredientNames.some(ingName => ingName.includes(term))
    );
  });

  displayRecipes(filtered, 'recipeResults', { highlightIngredients: searchTerms });
}



function displayRecipes(list, containerId = 'recipeResults', options = {}) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const highlightIngredients = options.highlightIngredients || [];
  const highlightTags = options.highlightTags || [];

  if (list.length === 0) {
    container.innerHTML = '<p class="text-muted">No matching recipes found.</p>';
    return;
  }

  list.forEach(r => {
    const card = document.createElement('div');
    card.className = 'card mb-3 shadow-sm';

    const body = document.createElement('div');
    body.className = 'card-body';

    // ➤ Title and Edit/Delete buttons row
    const titleRow = document.createElement('div');
    titleRow.className = 'd-flex justify-content-between align-items-center mb-3 gap-2';

    const title = document.createElement('span');
    title.className = 'badge bg-warning text-dark fs-5 py-2 px-3 mb-0';
    title.style.minWidth = '150px';
    title.textContent = r.name;

    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn btn-outline-secondary btn-sm btn-share';
    shareBtn.innerHTML = '🔗';
    shareBtn.title = 'Share recipe';
    shareBtn.onclick = () => shareRecipe(r.id);
    card.dataset.recipeId = r.id;

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-outline-primary btn-sm';
    editBtn.innerHTML = '✏️';
    editBtn.onclick = () => openInlineEditor(r.id, card);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-outline-danger btn-sm';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.onclick = () => confirmDeleteRecipe(r.id, deleteBtn);

    // ✅ Wrap delete button in .delete-area with relative positioning
    const deleteArea = document.createElement('div');
    deleteArea.className = 'delete-area position-relative d-inline-block';
    deleteArea.appendChild(deleteBtn);

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'd-flex gap-2 align-items-center';
    buttonGroup.prepend(shareBtn);
    buttonGroup.appendChild(editBtn);
    buttonGroup.appendChild(deleteArea);

    titleRow.appendChild(title);
    titleRow.appendChild(buttonGroup);

    body.appendChild(titleRow);

    // ➤ Tags and Ratings row
    const tagsAndRatingRow = document.createElement('div');
    tagsAndRatingRow.className = 'd-flex justify-content-between align-items-center mb-2';

    const ratingContainer = document.createElement('div');
    ratingContainer.className = 'rating-stars d-flex gap-1';

    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('i');
      star.className = i <= (r.rating || 0) ? 'bi bi-star-fill text-warning' : 'bi bi-star text-warning';
      star.style.cursor = 'pointer';
      star.dataset.value = i;
      star.addEventListener('mouseenter', () => highlightStars(ratingContainer, i));
      star.addEventListener('mouseleave', () => resetStars(ratingContainer, r.rating || 0));
      star.addEventListener('click', () => updateRecipeRating(r.id, i));
      ratingContainer.appendChild(star);
    }

    const tagsRow = document.createElement('div');
    if (r.tags && r.tags.length > 0) {
      r.tags.forEach(tag => {
        const tagBadge = document.createElement('span');
        tagBadge.className = 'badge me-1';
        if (highlightTags.some(term => tag.toLowerCase().includes(term))) {
          tagBadge.classList.add('bg-warning', 'text-dark');
        } else {
          tagBadge.classList.add('bg-primary', 'text-white');
        }
        tagBadge.textContent = tag;
        tagsRow.appendChild(tagBadge);
      });
    }

    tagsAndRatingRow.appendChild(tagsRow);
    tagsAndRatingRow.appendChild(ratingContainer);
    body.appendChild(tagsAndRatingRow);

    // ➤ Ingredients table
    const table = document.createElement('table');
    table.className = 'table table-bordered table-sm mb-2';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Ingredient</th>
        <th>Qty</th>
        <th>Unit</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    if (Array.isArray(r.ingredients)) {
      r.ingredients.forEach(i => {
        const tr = document.createElement('tr');
        const nameTd = document.createElement('td');

        const ingName = typeof i === 'object' ? i.name : i;

        if (highlightIngredients.some(term => ingName.toLowerCase().includes(term))) {
          nameTd.innerHTML = `<span class="bg-warning">${ingName}</span>`;
        } else {
          nameTd.textContent = ingName;
        }

        const qtyTd = document.createElement('td');
        qtyTd.textContent = i.quantity || '';

        const unitTd = document.createElement('td');
        unitTd.textContent = i.unit || '';

        tr.appendChild(nameTd);
        tr.appendChild(qtyTd);
        tr.appendChild(unitTd);
        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    body.appendChild(table);

    // ➤ Instructions
    const instructions = document.createElement('p');
    instructions.innerHTML = `<strong>Instructions:</strong> ${r.instructions}`;
    body.appendChild(instructions);

    // ➤ Buttons row: Mark as Made + Plan Meal
    const buttonRow = document.createElement('div');
    buttonRow.className = 'd-flex align-items-center gap-2 mt-3';

    const madeBtn = document.createElement('button');
    madeBtn.className = 'btn btn-outline-info btn-sm';
    madeBtn.textContent = 'Mark as Made';
    madeBtn.onclick = (e) => markAsMade(r.name, e.target);

    const planArea = document.createElement('div');
    planArea.className = 'plan-area';

    const planBtn = document.createElement('button');
    planBtn.className = 'btn btn-outline-success btn-sm';
    planBtn.textContent = 'Plan Meal';
    planBtn.onclick = () => openPlanMealForm(r, planArea);

    planArea.appendChild(planBtn);

    buttonRow.appendChild(madeBtn);
    buttonRow.appendChild(planArea);

    body.appendChild(buttonRow);

    card.appendChild(body);
    container.appendChild(card);
  });
}

function shareRecipe(recipeId) {
  const recipe = recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  const { id, uid, ...shareableData } = recipe;
  const encoded = encodeURIComponent(JSON.stringify(shareableData));
  const shareUrl = `${window.location.origin}?shared=${encoded}`;

  // Locate the button and its container
  const card = document.querySelector(`[data-recipe-id="${recipeId}"]`);
  const shareBtn = card?.querySelector('.btn-share');
  if (!shareBtn) return;

  navigator.clipboard.writeText(shareUrl)
    .then(() => {
      // Swap button with message
      const message = document.createElement('span');
      message.textContent = '✅ Link copied!';
      message.className = 'text-success fw-semibold';

      shareBtn.replaceWith(message);

      // Restore button after 2.5 seconds
      setTimeout(() => {
        message.replaceWith(shareBtn);
      }, 2500);
    })
    .catch(err => {
      console.error("❌ Failed to copy:", err);
      alert("Could not copy the link.");
    });
}



function openPlanMealForm(recipe, container) {
  // Prevent multiple openings
  if (container.querySelector('input[type="date"]')) return;

  container.innerHTML = ''; // clear the Plan Meal button

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'form-control form-control-sm';
  dateInput.style.maxWidth = '150px'; // keep it compact inline

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-outline-dark btn-sm';
  saveBtn.textContent = '💾';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-outline-danger btn-sm';
  cancelBtn.textContent = '❌';

  // Inline flex for form
  const form = document.createElement('div');
  form.className = 'd-flex align-items-center gap-2';
  form.appendChild(dateInput);
  form.appendChild(saveBtn);
  form.appendChild(cancelBtn);

  container.appendChild(form);

  saveBtn.onclick = () => {
    const selectedDate = dateInput.value;
    if (!selectedDate) {
      dateInput.classList.add('is-invalid');
      return;
    }

    db.collection("planning").add({
      date: selectedDate,
      recipeId: recipe.id,
      recipeName: recipe.name,
      uid: currentUser.uid // ✅ REQUIRED BY SECURITY RULES
    }).then(() => {
      console.log("✅ Meal planned:", recipe.name, "on", selectedDate);
      container.innerHTML = '<span class="text-success fw-bold">✅ Planned!</span>';
      setTimeout(() => {
        container.innerHTML = '';
        const planBtn = document.createElement('button');
        planBtn.className = 'btn btn-outline-primary btn-sm';
        planBtn.textContent = 'Plan Meal';
        planBtn.onclick = () => openPlanMealForm(recipe, container);
        container.appendChild(planBtn);
      }, 2000);
    }).catch(err => {
      console.error("❌ Failed to plan meal:", err);
      container.innerHTML = '<span class="text-danger fw-bold">❌ Failed</span>';
      setTimeout(() => {
        container.innerHTML = '';
        const planBtn = document.createElement('button');
        planBtn.className = 'btn btn-outline-primary btn-sm';
        planBtn.textContent = 'Plan Meal';
        planBtn.onclick = () => openPlanMealForm(recipe, container);
        container.appendChild(planBtn);
      }, 2000);
    });
  };

  cancelBtn.onclick = () => {
    container.innerHTML = '';
    const planBtn = document.createElement('button');
    planBtn.className = 'btn btn-outline-primary btn-sm';
    planBtn.textContent = 'Plan Meal';
    planBtn.onclick = () => openPlanMealForm(recipe, container);
    container.appendChild(planBtn);
  };
}



function highlightStars(container, rating) {
  const stars = container.querySelectorAll('i');
  stars.forEach((star, idx) => {
    star.className = idx < rating ? 'bi bi-star-fill text-warning' : 'bi bi-star text-warning';
  });
}

function resetStars(container, rating) {
  const stars = container.querySelectorAll('i');
  stars.forEach((star, idx) => {
    star.className = idx < rating ? 'bi bi-star-fill text-warning' : 'bi bi-star text-warning';
  });
}

function updateRecipeRating(id, rating) {
  db.collection('recipes').doc(id).update({ rating })
    .then(() => {
      console.log(`✅ Rating updated to ${rating} stars`);
      loadRecipesFromFirestore(); // Refresh view
    })
    .catch(err => {
      console.error("❌ Error updating rating:", err);
    });
}


async function openInlineEditor(id, card) {
  try {
    const doc = await db.collection('recipes').doc(id).get();
    if (!doc.exists) {
      alert("Recipe not found.");
      return;
    }

    const data = doc.data();
    const ingredients = data.ingredients || [];
    let editingTags = [...(data.tags || [])];

    card.innerHTML = '';
    const body = document.createElement('div');
    body.className = 'card-body';

    // 📛 Recipe Name
    const nameLabel = document.createElement('label');
    nameLabel.className = 'form-label fw-semibold';
    nameLabel.textContent = '📛 Recipe Name';
    body.appendChild(nameLabel);

    const nameInput = document.createElement('input');
    nameInput.className = 'form-control mb-3';
    nameInput.value = data.name || '';
    body.appendChild(nameInput);

    // 🧂 Ingredients
    const ingLabel = document.createElement('label');
    ingLabel.className = 'form-label fw-semibold';
    ingLabel.textContent = '🧂 Ingredients';
    body.appendChild(ingLabel);

    const ingredientsGrid = document.createElement('div');
    ingredientsGrid.className = 'mb-2';
    ingredientsGrid.innerHTML = `
      <table class="table table-sm table-bordered mb-2">
        <thead>
          <tr><th>Ingredient</th><th>Qty</th><th>Unit</th><th></th></tr>
        </thead>
        <tbody id="editIngredientsTable-${id}"></tbody>
      </table>
    `;
    body.appendChild(ingredientsGrid);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-outline-primary btn-sm mb-3';
    addBtn.textContent = 'Add Ingredient';
    addBtn.onclick = () => addIngredientRow(id);
    body.appendChild(addBtn);

const breakLine = document.createElement('div');
breakLine.className = 'w-100';
body.appendChild(breakLine);

const instrLabel = document.createElement('label');
instrLabel.className = 'form-label fw-semibold mt-3';
instrLabel.textContent = '📝 Instructions';
body.appendChild(instrLabel);

const instructionsInput = document.createElement('textarea');
instructionsInput.className = 'form-control mb-3';
instructionsInput.rows = 4;
instructionsInput.value = data.instructions || '';
body.appendChild(instructionsInput);


    // 🏷️ Tags
    const tagsLabel = document.createElement('label');
    tagsLabel.className = 'form-label fw-semibold';
    tagsLabel.textContent = '🏷️ Tags';
    body.appendChild(tagsLabel);

    const tagsWrapper = document.createElement('div');
    tagsWrapper.className = 'mb-3';
    tagsWrapper.innerHTML = `
      <div id="inlineTagsContainer-${id}" class="form-control d-flex flex-wrap align-items-center gap-2 p-2 position-relative" style="min-height: 45px; background-color: #f8f9fa; border: 1px dashed #ced4da;">
        <span id="inlineTagsPlaceholder-${id}" class="text-muted position-absolute" style="left: 10px; top: 8px; pointer-events: none;">Add some tags...</span>
      </div>
      <div class="d-flex flex-nowrap mt-2 gap-2">
        <input type="text" id="inlineTagInput-${id}" class="form-control" placeholder="Type a tag" />
        <button type="button" id="inlineAddTagBtn-${id}" class="btn btn-outline-dark btn-sm w-25">Add Tag</button>
      </div>
    `;
    body.appendChild(tagsWrapper);

    const tagDivider = document.createElement('hr');
    tagDivider.className = 'my-3'; // adds vertical spacing (mt-3 + mb-3)
    tagDivider.style.borderTop = '2px solid #ccc'; // soft gray line
    body.appendChild(tagDivider);


    // Save / Cancel buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'd-flex gap-2 mt-3';
    btnRow.innerHTML = `
      <button class="btn btn-outline-primary btn-sm">Save</button>
      <button class="btn btn-outline-dark btn-sm">Cancel</button>
    `;
    body.appendChild(btnRow);

    card.appendChild(body);

    // Populate ingredient table
    const tbody = document.getElementById(`editIngredientsTable-${id}`);
    ingredients.forEach(i => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><input class="form-control form-control-sm" value="${i.name || ''}" placeholder="Ingredient"></td>
        <td><input class="form-control form-control-sm" value="${i.quantity || ''}" placeholder="Qty"></td>
        <td><input class="form-control form-control-sm" value="${i.unit || ''}" placeholder="Unit"></td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-danger" title="Delete ingredient">🗑️</button>
        </td>
      `;
      row.querySelector('button').onclick = () => row.remove();
      tbody.appendChild(row);
    });

    addIngredientRow(id); // always have a blank row

    // Tags logic
    const tagInput = document.getElementById(`inlineTagInput-${id}`);
    const tagsContainer = document.getElementById(`inlineTagsContainer-${id}`);
    const placeholder = document.getElementById(`inlineTagsPlaceholder-${id}`);

    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const value = tagInput.value.trim().toLowerCase();
        if (value && !editingTags.includes(value)) {
          editingTags.push(value);
          renderInlineTags();
        }
        tagInput.value = '';
      }
    });

    const tagAddButton = document.getElementById('tagAddButton');
    tagAddButton.onclick = () => {
      const value = tagInput.value.trim().toLowerCase();
      if (value && !currentTags.includes(value)) {
        currentTags.push(value);
        renderTags();
      }
      tagInput.value = '';
    };


    function renderInlineTags() {
      tagsContainer.innerHTML = '';

      if (editingTags.length === 0) {
        placeholder.style.display = 'block';
      } else {
        placeholder.style.display = 'none';
      }

      editingTags.forEach(tag => {
        const tagBadge = document.createElement('span');
        tagBadge.className = 'badge bg-primary text-white me-1';
        tagBadge.textContent = tag;
        tagBadge.onclick = () => {
          editingTags = editingTags.filter(t => t !== tag);
          renderInlineTags();
        };
        tagsContainer.appendChild(tagBadge);
      });
    }

    renderInlineTags();

    // Save button
    btnRow.querySelector('.btn-outline-primary').onclick = async () => {
      const updatedName = nameInput.value.trim();
      const updatedInstructions = instructionsInput.value.trim();
      const updatedIngredients = [];

      const rows = document.querySelectorAll(`#editIngredientsTable-${id} tr`);
      rows.forEach(row => {
        const cells = row.querySelectorAll('input');
        const name = cells[0].value.trim();
        const quantity = cells[1].value.trim();
        const unit = cells[2].value.trim();
        if (name) {
          updatedIngredients.push({ name, quantity, unit });
        }
      });

      try {
        await db.collection('recipes').doc(id).update({
          name: updatedName,
          ingredients: updatedIngredients,
          instructions: updatedInstructions,
          tags: editingTags,
        });
        console.log("✅ Recipe updated:", updatedName);
        loadRecipesFromFirestore(); // refresh view
      } catch (err) {
        console.error("Error updating recipe:", err);
        alert("Failed to save changes.");
      }
    };

    // Cancel button
    btnRow.querySelector('.btn-outline-dark').onclick = () => {
      loadRecipesFromFirestore(); // reload and exit
    };

    // Add blank ingredient row
    function addIngredientRow(editId) {
      const tbody = document.getElementById(`editIngredientsTable-${editId}`);
      const newRow = document.createElement('tr');
      newRow.innerHTML = `
        <td><input class="form-control form-control-sm" placeholder="Ingredient"></td>
        <td><input class="form-control form-control-sm" placeholder="Qty"></td>
        <td><input class="form-control form-control-sm" placeholder="Unit"></td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-danger" title="Delete ingredient">🗑️</button>
        </td>
      `;
      newRow.querySelector('button').onclick = () => newRow.remove();
      tbody.appendChild(newRow);
    }

  } catch (err) {
    console.error("Error opening inline editor:", err);
  }
}






function addIngredientEditRow(container, name = '', qty = '', unit = '') {
  const row = document.createElement('div');
  row.className = 'd-flex gap-2 mb-2';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Ingredient';
  nameInput.className = 'form-control';
  nameInput.value = name;

  const qtyInput = document.createElement('input');
  qtyInput.type = 'text';
  qtyInput.placeholder = 'Qty';
  qtyInput.className = 'form-control';
  qtyInput.value = qty;

  const unitInput = document.createElement('input');
  unitInput.type = 'text';
  unitInput.placeholder = 'Unit';
  unitInput.className = 'form-control';
  unitInput.value = unit;

  row.appendChild(nameInput);
  row.appendChild(qtyInput);
  row.appendChild(unitInput);

  container.appendChild(row);
}

async function saveInlineEdit(recipeId, nameInput, tagsInput, ingredientsDiv, instructionsInput) {
  const name = nameInput.value.trim();
  const tags = tagsInput.value.trim() ? tagsInput.value.trim().split(',').map(t => t.trim().toLowerCase()) : [];
  const instructions = instructionsInput.value.trim();

  const ingredients = [];
  ingredientsDiv.querySelectorAll('div').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const ingName = inputs[0].value.trim();
    const ingQty = inputs[1].value.trim();
    const ingUnit = inputs[2].value.trim();

    if (ingName) {
      ingredients.push({ name: ingName, quantity: ingQty, unit: ingUnit });
    }
  });

  try {
    await db.collection('recipes').doc(recipeId).update({
      name,
      tags,
      ingredients,
      instructions
    });

    console.log("✅ Recipe updated!");

    await loadRecipesFromFirestore(); // <-- Make sure THIS returns a Promise!

    showRecipeFilter(); // <-- Now re-renders fresh recipes
  } catch (err) {
    console.error("❌ Error saving recipe:", err);
    alert('Failed to save recipe.');
  }
}



function deleteRecipe(id) {
  if (!confirm("Are you sure you want to delete this recipe?")) return;

  db.collection("recipes").doc(id).delete().then(() => {
    console.log("Recipe deleted:", id);
    loadRecipesFromFirestore(); // Refresh list
  }).catch(err => {
    console.error("Error deleting recipe:", err);
    alert("Failed to delete recipe.");
  });
}

function confirmDeleteRecipe(id, buttonElement) {
  const container = buttonElement.closest('.delete-area');

  if (!container || container.querySelector('.confirm-delete')) return;

  // Hide the original delete button
  buttonElement.style.display = 'none';

  // Inline confirm bar (mimicking Plan Meal style)
  const confirmBar = document.createElement('div');
  confirmBar.className = 'confirm-delete d-inline-flex align-items-center gap-2';

  const text = document.createElement('span');
  text.className = 'text-danger fw-semibold';
  text.textContent = 'Confirm?';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-sm btn-outline-success';
  confirmBtn.innerHTML = '✅';
  confirmBtn.onclick = () => {
    db.collection("recipes").doc(id).delete()
      .then(() => {
        loadRecipesFromFirestore(); // Refresh
      })
      .catch(err => {
        console.error("❌ Error deleting recipe:", err);
        alert("Failed to delete recipe.");
        // Restore on failure
        confirmBar.remove();
        buttonElement.style.display = '';
      });
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-sm btn-outline-danger';
  cancelBtn.innerHTML = '❌';
  cancelBtn.onclick = () => {
    confirmBar.remove();
    buttonElement.style.display = ''; // Restore original icon
  };

  confirmBar.appendChild(text);
  confirmBar.appendChild(confirmBtn);
  confirmBar.appendChild(cancelBtn);

  container.appendChild(confirmBar);
}




function saveMadeNote() {
  const notes = document.getElementById('madeNotes').value;

  db.collection("history").add({
    recipe: madeModalRecipe,
    timestamp: new Date().toISOString(),
    notes: notes || '',
    uid: currentUser.uid // 🔥 save the user id
  }).then(() => {
    const modal = bootstrap.Modal.getInstance(document.getElementById('madeModal'));
    modal.hide();
    alert("Recipe marked as made!");
  }).catch((err) => {
    console.error("Failed to save history entry:", err);
    alert("Error saving history.");
  });
}

function loadRecipesFromFirestore() {
  if (!currentUser) {
    recipes = [];
    showRecipeFilter();
    return;
  }

  db.collection('recipes')
    .where('uid', '==', currentUser.uid) // 🔥 Only pull user’s own recipes
    .get()
    .then(snapshot => {
      recipes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log("Loaded recipes:", recipes);
      showRecipeFilter();
    })
    .catch(err => {
      console.error("❌ Error loading recipes from Firestore:", err);
    });
}




let ingredientsData = [];

async function showIngredients() {
    const view = document.getElementById('mainView');
    view.innerHTML = `
      <h5 class="mb-3">🧂 Ingredients Repository</h5>
      <input type="text" class="form-control mb-3" id="ingredientSearch" placeholder="Search ingredient..." oninput="filterIngredients()" />
  
      <button class="btn btn-outline-dark mb-3" onclick="toggleAddIngredient()">Add Ingredient</button>
      
      <div id="addIngredientForm" class="mb-4" style="display: none;">
        <div class="card card-body">
          <input class="form-control mb-2" id="newIngName" placeholder="Name" />
          <input class="form-control mb-2" id="newIngComponents" placeholder="Components (comma separated)" />
          <input class="form-control mb-2" id="newIngUnit" placeholder="Unit (e.g. oz, lb)" />
          <input class="form-control mb-2" id="newIngCost" placeholder="Cost (e.g. 1.50)" type="number" step="0.01" />
          <input class="form-control mb-2" id="newIngStore" placeholder="Store URL" />
          <button class="btn btn-outline-dark" onclick="addIngredient()">Add</button>
        </div>
      </div>
  
      <div id="ingredientList"></div>
    `;
  
    await loadIngredientsFromFirestore();
  
    renderIngredientList(ingredientsData);
  }
  

function renderIngredientList(data) {
  const list = document.getElementById('ingredientList');
  list.innerHTML = '';

  if (data.length === 0) {
    list.innerHTML = '<p>No ingredients found.</p>';
    return;
  }

  data.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';

    const body = document.createElement('div');
    body.className = 'card-body';

    body.innerHTML = `
      <h5 class="card-title text-capitalize">${item.name}</h5>
      ${item.tags && item.tags.length > 0 ? `
        <div class="mb-2">
          ${item.tags.map(tag => `<span class="badge bg-secondary me-1">${tag}</span>`).join('')}
        </div>
      ` : ''}      
      <p>🧬 <strong>Made of:</strong> ${item.components.length ? item.components.join(', ') : '—'}</p>
      <p>📏 <strong>Unit:</strong> ${item.unit}</p>
      <p>💲 <strong>Cost:</strong> $${item.cost.toFixed(2)}</p>
      <a href="${item.store}" class="btn btn-sm btn-outline-dark" target="_blank">🛒 View in Store</a>
    `;

    card.appendChild(body);
    list.appendChild(card);
  });
}

function filterIngredients() {
  const query = document.getElementById('ingredientSearch').value.toLowerCase();
  const filtered = ingredientsData.filter(i => i.name.toLowerCase().includes(query));
  renderIngredientList(filtered);
}

function toggleAddIngredient() {
    const form = document.getElementById('addIngredientForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  }
  
function addIngredient() {
  const name = document.getElementById('newIngName').value.trim();
  const components = document.getElementById('newIngComponents').value.split(',').map(c => c.trim()).filter(Boolean);
  const unit = document.getElementById('newIngUnit').value.trim();
  const cost = parseFloat(document.getElementById('newIngCost').value);
  const store = document.getElementById('newIngStore').value.trim();

  if (!name || isNaN(cost) || !unit) {
    alert("Please fill out at least name, unit, and cost.");
    return;
  }

  const newIngredient = {
    name,
    components,
    unit,
    cost,
    store
  };

  db.collection("ingredients").add(newIngredient).then(() => {
    loadIngredientsFromFirestore(); // Refresh after saving
    toggleAddIngredient(); // Hide the form
  }).catch((err) => {
    console.error("Error saving ingredient:", err);
    alert("Failed to save ingredient.");
  });
}
  
function loadIngredientsFromFirestore() {
  db.collection("ingredients").get().then(snapshot => {
    ingredientsData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderIngredientList(ingredientsData);
  }).catch(err => {
    console.error("Error loading ingredients:", err);
  });
}

function showPlanning() {
  const view = document.getElementById('mainView');
  view.className = 'section-planning';
  view.innerHTML = `
    <h5 class="mb-3">📋 Planned Meals</h5>

    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0">Planned Meals</h6>
      <button id="clearPlanningBtn" class="btn btn-outline-danger btn-sm" onclick="clearAllPlanning(this)">🧹 Clear Planned Meals</button>
    </div>

    <div id="plannedMealsList" class="mb-4"></div>

    <hr />

    <h5 class="mb-3">🛒 Shopping List</h5>

    <div class="d-flex justify-content-between align-items-center mb-2">
      <button class="btn btn-outline-success" onclick="generateShoppingList()">🛒 Generate Ingredient Checklist</button>
      <button id="clearShoppingListBtn" class="btn btn-outline-danger btn-sm" onclick="clearShoppingList()" disabled>🗑️ Clear Shopping List</button>
    </div>

    <div id="shoppingListResults" class="mb-4"></div>

    <hr />

    <h5 class="mb-3">Plan a New Meal</h5>

    <div class="mb-3">
      <label class="form-label">📅 Select Date:</label>
      <input type="date" class="form-control" id="planDate" />
    </div>

    <div class="mb-3">
      <label class="form-label">🍽️ Select Recipe:</label>
      <select id="planRecipe" class="form-select">
        <option value="">-- Choose --</option>
      </select>
    </div>

    <button class="btn btn-outline-success btn-sm">
      <span class="text-success"></span> Add to Plan
    </button>

  `;

  populateRecipeDropdown();
  loadPlannedMeals();
  loadShoppingList();
}

function populateRecipeDropdown() {
  const select = document.getElementById('planRecipe');
  select.innerHTML = '<option value="">-- Choose --</option>';
  recipes.forEach(recipe => {
    const option = document.createElement('option');
    option.value = recipe.id;
    option.textContent = recipe.name;
    select.appendChild(option);
  });
}

function addPlannedMeal() {
  const date = document.getElementById('planDate').value;
  const recipeId = document.getElementById('planRecipe').value;

  if (!date || !recipeId) {
    alert("Please select a date and a recipe!");
    return;
  }

  // ✅ Find the recipe object
  const recipe = recipes.find(r => r.id === recipeId);

  if (!recipe) {
    alert("Recipe not found!");
    return;
  }

  db.collection("planning").add({
    date,
    recipeId,
    recipeName: recipe.name,
    uid: currentUser.uid // 🔥 save the user id
  }).then(() => {
    console.log("✅ Meal added to planning:", recipe.name);
    loadPlannedMeals();
  }).catch(err => {
    console.error("❌ Error adding to planning:", err);
  });
}


function loadPlannedMeals() {
  const list = document.getElementById('plannedMealsList');
  list.innerHTML = 'Loading...';

  db.collection("planning")
  .where('uid', '==', currentUser.uid)
  .orderBy('date')
  .get().then(snapshot => {
    if (snapshot.empty) {
      list.innerHTML = '<p class="text-muted">No planned meals yet.</p>';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'list-group';

    snapshot.forEach(doc => {
      const data = doc.data();
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';

      const info = document.createElement('div');
      info.innerHTML = `<strong>${data.date}:</strong> ${data.recipeName}`;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-outline-danger btn-sm';
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.onclick = () => deletePlannedMeal(doc.id, deleteBtn);

      li.appendChild(info);
      li.appendChild(deleteBtn);
      ul.appendChild(li);
    });

    list.innerHTML = '';
    list.appendChild(ul);
  }).catch(err => {
    console.error("Error loading planning:", err);
  });
}

function generateShoppingList() {
  const output = document.getElementById('shoppingListResults');
  output.innerHTML = 'Generating...';

  db.collection("planning")
  .where('uid', '==', currentUser.uid)
  .get()
  .then(snapshot => {
    if (snapshot.empty) {
      output.innerHTML = '<p class="text-muted">No planned meals found.</p>';
      return;
    }

    const recipeIds = snapshot.docs.map(doc => doc.data().recipeId);
    const ingredientMap = {};

    recipeIds.forEach(id => {
      const recipe = recipes.find(r => r.id === id);
      if (!recipe || !recipe.ingredients) return;

      recipe.ingredients.forEach(ing => {
        const key = `${ing.name}|${ing.unit}`.toLowerCase();
        const qty = parseFloat(ing.quantity) || 0;

        if (!ingredientMap[key]) {
          ingredientMap[key] = { ...ing, quantity: qty };
        } else {
          ingredientMap[key].quantity += qty;
        }
      });
    });

    // Prepare ingredients list
    const ingredients = Object.values(ingredientMap).map(ing => ({
      name: ing.name,
      unit: ing.unit,
      quantity: ing.quantity,
      checked: false // start unchecked
    }));

    renderShoppingList(ingredients);

    // Save it to Firestore!
    db.collection("shopping").doc(currentUser.uid).set({
      ingredients,
      uid: currentUser.uid
      })
      .then(() => console.log("✅ Shopping list saved to cloud"))
      .catch(err => console.error("❌ Failed to save shopping list:", err));
  });
}

function deletePlannedMeal(planId, button) {
  if (button.parentElement.querySelector('.confirm-delete')) return;

  button.style.display = 'none';

  const confirmArea = document.createElement('div');
  confirmArea.className = 'confirm-delete d-flex gap-2 align-items-center';

  const confirmText = document.createElement('span');
  confirmText.textContent = 'Confirm?';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'btn btn-sm btn-outline-danger';
  yesBtn.textContent = 'Yes';
  yesBtn.onclick = () => {
    db.collection("planning").doc(planId).delete()
      .then(() => {
        console.log("✅ Meal removed from plan:", planId);
        loadPlannedMeals(); // Refresh list
      })
      .catch(err => {
        console.error("❌ Error removing planned meal:", err);
        // 🛠 Restore the delete button if error
        confirmArea.remove();
        button.style.display = '';
      });
  };

  const noBtn = document.createElement('button');
  noBtn.className = 'btn btn-sm btn-outline-dark';
  noBtn.textContent = 'No';
  noBtn.onclick = () => {
    confirmArea.remove();
    button.style.display = ''; // 🛠 Restore delete button
  };

  confirmArea.appendChild(confirmText);
  confirmArea.appendChild(yesBtn);
  confirmArea.appendChild(noBtn);

  button.parentElement.appendChild(confirmArea);
}

function renderShoppingList(ingredients) {
  const output = document.getElementById('shoppingListResults');
  output.innerHTML = '';

  const list = document.createElement('ul');
  list.className = 'list-group';

  ingredients.forEach((ing, idx) => {
    const item = document.createElement('li');
    item.className = 'list-group-item d-flex justify-content-between align-items-center';
    item.dataset.index = idx;

    const leftSide = document.createElement('div');
    leftSide.className = 'd-flex align-items-center gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'form-check-input';
    checkbox.checked = ing.checked;

    const label = document.createElement('span');
    label.textContent = `${ing.quantity} ${ing.unit} ${ing.name}`;

    if (checkbox.checked) {
      label.style.textDecoration = 'line-through';
      label.style.opacity = '0.6';
    }

    leftSide.appendChild(checkbox);
    leftSide.appendChild(label);

    // 🗑️ Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-outline-danger btn-sm';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.onclick = () => {
      ingredients.splice(idx, 1); // Remove from local array
      db.collection("shopping").doc(currentUser.uid).set({
        ingredients,
        uid: currentUser.uid // ✅ Required by your Firestore rules
      })
        .then(() => {
          renderShoppingList(ingredients); // Re-render
        })
        .catch(err => {
          console.error("❌ Failed to update shopping list:", err);
        });
    };

    item.appendChild(leftSide);
    item.appendChild(deleteBtn);
    list.appendChild(item);

    // 📦 Click anywhere in left side toggles checkbox
    item.addEventListener('click', (e) => {
      if (e.target === deleteBtn || e.target === checkbox) return; // Ignore clicking delete/checkbox

      checkbox.checked = !checkbox.checked;
      if (checkbox.checked) {
        label.style.textDecoration = 'line-through';
        label.style.opacity = '0.6';
      } else {
        label.style.textDecoration = 'none';
        label.style.opacity = '1';
      }

      ingredients[idx].checked = checkbox.checked;
      db.collection("shopping").doc(currentUser.uid).set({
        ingredients,
        uid: currentUser.uid
      });
    });

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        label.style.textDecoration = 'line-through';
        label.style.opacity = '0.6';
      } else {
        label.style.textDecoration = 'none';
        label.style.opacity = '1';
      }

      ingredients[idx].checked = checkbox.checked;
      db.collection("shopping").doc(currentUser.uid).set({
        ingredients,
        uid: currentUser.uid
      });
    });
  });

  output.appendChild(list);

  const clearBtn = document.getElementById('clearShoppingListBtn');
  if (clearBtn) clearBtn.disabled = ingredients.length === 0;
}



function loadShoppingList() {
  const uid = currentUser.uid;
  const docRef = db.collection("shopping").doc(uid);

  docRef.get().then(doc => {
    const clearBtn = document.getElementById('clearShoppingListBtn');

    if (doc.exists) {
      const data = doc.data();
      if (data.ingredients && data.ingredients.length > 0) {
        renderShoppingList(data.ingredients);
        if (clearBtn) clearBtn.disabled = false;
      } else {
        document.getElementById('shoppingListResults').innerHTML = '<p class="text-muted">No shopping list generated.</p>';
        if (clearBtn) clearBtn.disabled = true;
      }
    } else {
      // 🆕 Create an empty shopping list document scoped to user
      docRef.set({
        ingredients: [],
        uid: uid
      }).then(() => {
        console.log("✅ Initialized empty shopping list for", uid);
        document.getElementById('shoppingListResults').innerHTML = '<p class="text-muted">No shopping list generated.</p>';
        if (clearBtn) clearBtn.disabled = true;
      }).catch(err => {
        console.error("❌ Failed to initialize shopping list:", err);
      });
    }
  }).catch(err => {
    console.error("❌ Failed to load shopping list:", err);
  });
}

function clearShoppingList() {
  console.log("🛠️ clearShoppingList() clicked");
  
  const clearBtn = document.getElementById('clearShoppingListBtn');
  if (!clearBtn) {
    console.log("❌ clearShoppingListBtn not found");
    return;
  }

  // Prevent multiple confirms
  if (clearBtn.parentElement.querySelector('.confirm-clear-shopping')) {
    console.log("❌ Already confirming");
    return;
  }

  clearBtn.style.display = 'none'; // Hide original button

  const confirmArea = document.createElement('div');
  confirmArea.className = 'confirm-clear-shopping d-flex gap-2 align-items-center';

  const confirmText = document.createElement('span');
  confirmText.textContent = 'Clear entire shopping list?';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'btn btn-sm btn-outline-danger';
  yesBtn.textContent = 'Yes';

  const noBtn = document.createElement('button');
  noBtn.className = 'btn btn-sm btn-outline-dark';
  noBtn.textContent = 'No';

  confirmArea.appendChild(confirmText);
  confirmArea.appendChild(yesBtn);
  confirmArea.appendChild(noBtn);

  clearBtn.parentElement.appendChild(confirmArea);

  // Confirm YES
  yesBtn.onclick = () => {
    db.collection("shopping").doc(currentUser.uid).delete().then(() => {
      document.getElementById('shoppingListResults').innerHTML = '<p class="text-muted">No shopping list generated.</p>';
      console.log("✅ Shopping list cleared.");

      // Clean up confirm box
      confirmArea.remove();
      clearBtn.disabled = true; // Disable after clearing
      clearBtn.style.display = 'block';
    }).catch(err => {
      console.error("❌ Failed to clear shopping list:", err);
    });
  };

  // Cancel NO
  noBtn.onclick = () => {
    confirmArea.remove();
    clearBtn.style.display = 'block'; // Restore the original button
  };
}


function clearCheckedIngredients() {
  const clearBtn = document.getElementById('clearCheckedBtn');
  if (!clearBtn) return;

  // Prevent multiple confirms
  if (clearBtn.parentElement.querySelector('.confirm-clear-checked')) return;

  clearBtn.style.display = 'none'; // Hide original button

  const confirmArea = document.createElement('div');
  confirmArea.className = 'confirm-clear-checked d-flex gap-2 align-items-center';

  const confirmText = document.createElement('span');
  confirmText.textContent = 'Clear all checked items?';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'btn btn-sm btn-outline-danger';
  yesBtn.textContent = 'Yes';

  const noBtn = document.createElement('button');
  noBtn.className = 'btn btn-sm btn-outline-dark';
  noBtn.textContent = 'No';

  confirmArea.appendChild(confirmText);
  confirmArea.appendChild(yesBtn);
  confirmArea.appendChild(noBtn);

  clearBtn.parentElement.appendChild(confirmArea);

  // Yes clears
  yesBtn.onclick = () => {
    db.collection("shopping").doc(currentUser.uid).get().then(doc => {
      if (!doc.exists) return;

      const data = doc.data();
      const filtered = data.ingredients.filter(ing => !ing.checked);

      return db.collection("shopping").doc(currentUser.uid).set({ ingredients, uid: currentUser.uid })
        .then(() => {
          renderShoppingList(filtered);
          console.log("✅ Cleared checked items");

          // Cleanup UI
          confirmArea.remove();
          clearBtn.style.display = 'none'; // still hidden if no checked left
        });
    }).catch(err => {
      console.error("❌ Failed to clear checked items:", err);
    });
  };

  // No cancels
  noBtn.onclick = () => {
    confirmArea.remove();
    clearBtn.style.display = 'block'; // restore button
  };
}


function updateClearCheckedButton(ingredients) {
  const hasChecked = ingredients.some(ing => ing.checked);
  const btn = document.getElementById('clearCheckedBtn');
  if (btn) {
    btn.style.display = hasChecked ? 'block' : 'none';
  }
}

const auth = firebase.auth();

// Utility to get initials
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  const first = parts[0]?.charAt(0).toUpperCase() || '';
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
  return first + last;
}

// Update auth UI
function updateAuthUI(user) {
  const authArea = document.getElementById('userAuthArea');
  authArea.innerHTML = '';

  if (user) {
    const wrapper = document.createElement('div');
    wrapper.className = 'position-relative';
  
    const avatarBtn = document.createElement('button');
    avatarBtn.className = 'btn btn-outline-dark rounded-circle fw-bold';
    avatarBtn.style.width = '45px';
    avatarBtn.style.height = '45px';
    avatarBtn.style.fontSize = '1rem';
    avatarBtn.style.padding = '0';
    avatarBtn.style.display = 'flex';
    avatarBtn.style.alignItems = 'center';
    avatarBtn.style.justifyContent = 'center';
    avatarBtn.title = user.displayName || 'Account';
    avatarBtn.textContent = getInitials(user.displayName || user.email);
  
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown-menu p-2 shadow-sm user-dropdown';
    dropdown.style.position = 'absolute';
    dropdown.style.top = '50px';
    dropdown.style.right = '0';
    dropdown.style.minWidth = '120px';
    dropdown.style.display = 'none'; // hidden by default
  
    const signOutBtn = document.createElement('button');
    signOutBtn.className = 'dropdown-item text-danger';
    signOutBtn.textContent = 'Sign Out';
    signOutBtn.onclick = () => {
      signOut();
      dropdown.style.display = 'none';
    };
  
    dropdown.appendChild(signOutBtn);
  
    avatarBtn.onclick = (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    };
  
    wrapper.appendChild(avatarBtn);
    wrapper.appendChild(dropdown);
  
    authArea.appendChild(wrapper);
  }
  
  else {
    // Not logged in - show Sign In button
    const signInBtn = document.createElement('button');
    signInBtn.className = 'btn btn-outline-dark d-flex align-items-center gap-2';
    signInBtn.innerHTML = `
      <i class="bi bi-person"></i> Sign in
    `;
    signInBtn.onclick = () => {
      signInWithGoogle();
    };

    authArea.appendChild(signInBtn);
  }
}

// Google Sign In
function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then((result) => {
      console.log("✅ Signed in:", result.user.displayName);
      updateAuthUI(result.user);
    })
    .catch((error) => {
      console.error("❌ Sign-in error:", error);
    });
}

// Sign Out
function signOut() {
  auth.signOut()
    .then(() => {
      console.log("✅ Signed out");
      updateAuthUI(null);
    })
    .catch((error) => {
      console.error("❌ Sign-out error:", error);
    });
}

// Watch auth state
auth.onAuthStateChanged(user => {
  currentUser = user; // 🔥 Save current user globally
  updateAuthUI(user);
  if (user) {
    loadRecipesFromFirestore(); // Load recipes for THIS user
  } else {
    // Optionally show a login screen or clear recipes
    recipes = [];
    showRecipeFilter(); // Show empty screen
  }
});

// Global click listener to close user dropdown
document.addEventListener('click', function (event) {
  const dropdown = document.querySelector('.user-dropdown');
  if (dropdown && dropdown.style.display === 'block') {
    dropdown.style.display = 'none';
  }
});

function showSharedOverlay(recipe) {
  const overlay = document.createElement('div');
  overlay.className = 'position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex justify-content-center align-items-center';
  overlay.style.zIndex = 2000;

  const card = document.createElement('div');
  card.className = 'card shadow-lg p-4';
  card.style.maxWidth = '600px';
  card.style.width = '95%';
  card.innerHTML = `
    <h4 class="mb-3">${recipe.name}</h4>
    <div class="mb-2">${(recipe.tags || []).map(tag => `<span class="badge bg-primary me-1">${tag}</span>`).join('')}</div>
    <table class="table table-sm table-bordered">
      <thead><tr><th>Ingredient</th><th>Qty</th><th>Unit</th></tr></thead>
      <tbody>
        ${(recipe.ingredients || []).map(i => `
          <tr><td>${i.name}</td><td>${i.quantity}</td><td>${i.unit}</td></tr>
        `).join('')}
      </tbody>
    </table>
    <p><strong>Instructions:</strong> ${recipe.instructions}</p>
    <div class="d-flex justify-content-end gap-2 mt-3">
      <button class="btn btn-outline-success" onclick="saveSharedRecipe(${JSON.stringify(recipe).replace(/"/g, '&quot;')})">Save to My Recipes</button>
      <button class="btn btn-outline-light" onclick="this.closest('.position-fixed').remove()">Close</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function saveSharedRecipe(recipe) {
  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }

  const newRecipe = {
    ...recipe,
    uid: currentUser.uid,
    timestamp: new Date()
  };

  db.collection("recipes").add(newRecipe).then(() => {
    alert("✅ Recipe saved!");
    document.querySelector('.position-fixed').remove();
    loadRecipesFromFirestore();
  }).catch(err => {
    console.error("❌ Error saving shared recipe:", err);
    alert("Failed to save recipe.");
  });

  history.replaceState({}, document.title, window.location.pathname);
}


window.onload = () => {
  const params = new URLSearchParams(window.location.search);
  const shared = params.get('shared');

  if (shared) {
    try {
      const sharedRecipe = JSON.parse(decodeURIComponent(shared));
      showSharedOverlay(sharedRecipe);
    } catch (err) {
      console.error("❌ Invalid shared data:", err);
    }
  } else {
    loadRecipesFromFirestore();
  }
};
