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

      <input class="form-control mb-2" id="recipeNameInput" placeholder="Recipe name" />

      <div class="mb-3">
      <div id="tagsContainer" class="form-control position-relative d-flex flex-wrap align-items-center gap-2 p-2" style="min-height: 45px;">
        <span id="tagsPlaceholder" class="text-muted" style="position: absolute; left: 10px; top: 8px; pointer-events: none;">🏷️ Add some tags...</span>
      </div>
      <input type="text" id="tagInput" class="form-control mt-2" placeholder="Type a tag and press Enter" />
      </div>

      <div id="ingredientsGrid" class="mb-3">
        <label class="form-label">🧂 Ingredients</label>
        <div id="ingredientsTable"></div>
      </div>

      <textarea class="form-control mb-2" id="recipeInstructionsInput" rows="4" placeholder="Instructions"></textarea>

      <div class="d-flex gap-2">
        <button class="btn btn-outline-primary" onclick="saveRecipe()">Add Recipe</button>
        <button class="btn btn-outline-dark" onclick="toggleRecipeForm()">Cancel</button>
      </div>

      <div class="mb-3">
        <label for="recipePhotoInput" class="form-label">📷 Upload or Take a Recipe Photo</label>
        <input
          type="file"
          id="recipePhotoInput"
          accept="image/*"
          capture="environment"
          class="form-control"
          onchange="handleRecipePhoto(event)"
        />
      </div>

      <!-- ✅ This goes here, inside the card -->
      <div id="photoPreviewContainer" class="mb-3"></div>

    </div> <!-- end card-body -->
  </div> <!-- end collapsible form -->

  <div id="recipeResults"></div>
`;

  displayRecipes(recipes, 'recipeResults');
}

function createIngredientRow(name = '', unit = '', qty = '') {
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
  qtyCol.className = 'col-3';
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
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

  row.appendChild(nameCol);
  row.appendChild(qtyCol);
  row.appendChild(unitCol);

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

      const result = document.createElement('textarea');
      result.value = text;
      result.rows = 10;
      result.className = 'form-control mt-2';

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

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-outline-dark btn-sm me-2';
  saveBtn.textContent = '💾 Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-outline-danger btn-sm';
  cancelBtn.textContent = '❌ Cancel';

  // Save note
  saveBtn.onclick = () => {
    const notes = textarea.value.trim();

    db.collection("history").add({
      recipe: madeModalRecipe,
      timestamp: new Date().toISOString(),
      notes: notes || '',
      uid: currentUser.uid // 🔥 VERY IMPORTANT
    }).then(() => {
      console.log("✅ History entry added!");
      form.innerHTML = '<div class="text-success fw-bold">✅ Marked as made!</div>';
      setTimeout(() => form.remove(), 2000);
    }).catch(err => {
      console.error("❌ Failed to save history:", err);
      alert('Failed to save history.');
    });
  };

  // Cancel editing
  cancelBtn.onclick = () => form.remove();

  form.appendChild(textarea);
  form.appendChild(saveBtn);
  form.appendChild(cancelBtn);

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
      createIngredientRow(i.name, i.unit, i.quantity);
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

  const scaleFactor = 2; // Upscale for better pixel resolution
  const width = img.naturalWidth * scaleFactor;
  const height = img.naturalHeight * scaleFactor;

  canvas.width = width;
  canvas.height = height;

  ctx.filter = "grayscale(1) contrast(1.5) brightness(1.2)";
  ctx.drawImage(img, 0, 0, width, height);


  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const avg = (r + g + b) / 3;

    // Increase contrast manually
    const contrast = avg > 180 ? 255 : 0;

    data[i] = data[i + 1] = data[i + 2] = contrast;
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL();
}

function parseOcrToRecipeFields(ocrText) {
  const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l);

  const recipe = {
    title: '',
    ingredients: [],
    instructions: ''
  };

  let inIngredients = false;
  let inInstructions = false;
  const instructionLines = [];

  lines.forEach(line => {
    const lower = line.toLowerCase();

    if (!recipe.title) {
      recipe.title = line;
      return;
    }

    if (lower.includes('ingredient')) {
      inIngredients = true;
      inInstructions = false;
      return;
    }

    if (lower.includes('instruction') || lower.includes('method') || lower.includes('directions')) {
      inInstructions = true;
      inIngredients = false;
      return;
    }

    if (inIngredients) {
      const match = line.match(/^([\d\/.\s]+)?\s*([a-zA-Z]+)?\s*(.+)$/);
      if (match) {
        const qty = (match[1] || '').trim();
        const unit = (match[2] || '').trim();
        const name = (match[3] || '').trim();
        if (name) {
          recipe.ingredients.push({
            name,
            quantity: qty || '',
            unit: unit || ''
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

    if (name && qty && unit) {
      ingredients.push({ name, quantity: qty, unit });
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
    <input type="text" class="form-control mb-3" id="historySearch" placeholder="Search history..." oninput="filterHistory()" />
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


function renderHistoryList(entries) {
  const container = document.getElementById('historyList');
  container.innerHTML = '';

  if (entries.length === 0) {
    container.innerHTML = '<p>No history found.</p>';
    return;
  }

  entries.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'card';

    const body = document.createElement('div');
    body.className = 'card-body';

    body.innerHTML = `
      <h5 class="card-title">${entry.recipe}</h5>
      <p><strong>Date:</strong> ${new Date(entry.timestamp).toLocaleString()}</p>
      <p><strong>Notes:</strong> ${entry.notes || '(No notes)'}</p>
    `;

    card.appendChild(body);
    container.appendChild(card);
  });
}

function filterHistory() {
  const query = document.getElementById('historySearch').value.toLowerCase();

  db.collection("history").orderBy("timestamp", "desc").get().then(snapshot => {
    const allEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const filtered = query
      ? allEntries.filter(entry =>
          entry.recipe.toLowerCase().includes(query) ||
          (entry.notes && entry.notes.toLowerCase().includes(query))
        )
      : allEntries;

    renderHistoryList(filtered);
  });
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

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-outline-primary btn-sm';
    editBtn.innerHTML = '✏️ Edit';
    editBtn.onclick = () => openInlineEditor(r.id, card);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-outline-danger btn-sm';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.onclick = () => confirmDeleteRecipe(r.id, deleteBtn);

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'd-flex gap-2 align-items-center';
    buttonGroup.appendChild(editBtn);
    buttonGroup.appendChild(deleteBtn);

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

    // Recipe name input
    const nameInput = document.createElement('input');
    nameInput.className = 'form-control mb-2';
    nameInput.value = data.name || '';
    body.appendChild(nameInput);

    // Ingredients Grid
    const ingredientsGrid = document.createElement('div');
    ingredientsGrid.className = 'mb-2';
    ingredientsGrid.innerHTML = `
      <table class="table table-sm table-bordered mb-2">
        <thead>
          <tr><th>Ingredient</th><th>Qty</th><th>Unit</th></tr>
        </thead>
        <tbody id="editIngredientsTable-${id}"></tbody>
      </table>
    `;
    body.appendChild(ingredientsGrid);

    // Add Ingredient Button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-outline-primary btn-sm mb-3';
    addBtn.textContent = 'Add Ingredient';
    addBtn.onclick = () => addIngredientRow(id);
    body.appendChild(addBtn);

    // Instructions input
    const instructionsInput = document.createElement('textarea');
    instructionsInput.className = 'form-control mb-2';
    instructionsInput.rows = 4;
    instructionsInput.value = data.instructions || '';
    body.appendChild(instructionsInput);

    // Tags section
    const tagsWrapper = document.createElement('div');
    tagsWrapper.className = 'mb-2';
    tagsWrapper.innerHTML = `
      <div id="inlineTagsContainer-${id}" class="form-control position-relative d-flex flex-wrap align-items-center gap-2 p-2" style="min-height: 45px;">
        <span id="inlineTagsPlaceholder-${id}" class="text-muted" style="position: absolute; left: 10px; top: 8px; pointer-events: none;">🏷️ Add tags...</span>
      </div>
      <input type="text" id="inlineTagInput-${id}" class="form-control mt-2" placeholder="Type a tag and press Enter" />
    `;
    body.appendChild(tagsWrapper);

    // Save/Cancel buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'd-flex gap-2 mt-3';
    btnRow.innerHTML = `
      <button class="btn btn-outline-primary btn-sm">Save</button>
      <button class="btn btn-outline-dark btn-sm">Cancel</button>
    `;
    body.appendChild(btnRow);

    card.appendChild(body);

    // --- 🛠 Fill Ingredients ---
    const tbody = document.getElementById(`editIngredientsTable-${id}`);
    ingredients.forEach(i => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><input class="form-control form-control-sm" value="${i.name || ''}"></td>
        <td><input class="form-control form-control-sm" value="${i.quantity || ''}"></td>
        <td><input class="form-control form-control-sm" value="${i.unit || ''}"></td>
      `;
      tbody.appendChild(row);
    });
    addIngredientRow(id); // Always have a blank row

    // --- 🛠 Handle Tags ---
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

    renderInlineTags(); // First render

    // --- 🛠 Save Button ---
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
        loadRecipesFromFirestore(); // Refresh view
      } catch (err) {
        console.error("Error updating recipe:", err);
        alert("Failed to save changes.");
      }
    };

    // --- 🛠 Cancel Button ---
    btnRow.querySelector('.btn-outline-dark').onclick = () => {
      loadRecipesFromFirestore(); // Just reload and exit editor
    };

    // --- 🛠 Helper: Add Ingredient Row ---
    function addIngredientRow(editId) {
      const tbody = document.getElementById(`editIngredientsTable-${editId}`);
      const newRow = document.createElement('tr');
      newRow.innerHTML = `
        <td><input class="form-control form-control-sm" placeholder="Ingredient"></td>
        <td><input class="form-control form-control-sm" placeholder="Qty"></td>
        <td><input class="form-control form-control-sm" placeholder="Unit"></td>
      `;
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

  // Prevent duplicate boxes
  if (container.querySelector('.confirm-delete')) return;

  buttonElement.disabled = true; // disable button to prevent spam

  const confirmBox = document.createElement('div');
  confirmBox.className = 'confirm-delete mt-2';
  confirmBox.innerHTML = `
    <div class="border bg-light p-2 rounded d-flex align-items-center gap-2">
      <span>Delete this recipe?</span>
      <button class="btn btn-sm btn-outline-danger">Confirm</button>
      <button class="btn btn-sm btn-outline-dark">Cancel</button>
    </div>
  `;

  // Confirm
  confirmBox.querySelector('.btn-outline-danger').onclick = () => {
    db.collection("recipes").doc(id).delete().then(() => {
      loadRecipesFromFirestore();
    }).catch(err => {
      console.error("Error deleting recipe:", err);
      alert("Failed to delete recipe.");
    });
  };

  // Cancel
  confirmBox.querySelector('.btn-outline-dark').onclick = () => {
    confirmBox.remove();
    buttonElement.disabled = false;
  };

  container.appendChild(confirmBox);
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
      ${r.tags && r.tags.length > 0 ? `
        <div class="mb-2">
          ${r.tags.map(tag => `<span class="badge bg-secondary me-1">${tag}</span>`).join('')}
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


window.onload = () => {
  loadRecipesFromFirestore();
};