let recipes = [];
let madeModalRecipe = '';

async function loadRecipes() {
  const res = await fetch('recipes.json');
  recipes = await res.json();
  showRecipeFilter();
}

function showRecipeFilter() {
  const view = document.getElementById('mainView');
  view.innerHTML = `
  <h5 class="mb-3">📚 Recipes</h5>

  <input type="text" class="form-control mb-2" id="recipeSearch" placeholder="Filter by ingredient..." oninput="filterRecipesByText()" />

  <button class="btn btn-success mb-3" onclick="toggleRecipeForm()">➕ Add Recipe</button>

  <div id="recipeForm" class="collapsible-form mb-4">
    <div class="card card-body">

      <input class="form-control mb-2" id="recipeNameInput" placeholder="Recipe name" />

      <div id="ingredientsGrid" class="mb-3">
        <label class="form-label">🧂 Ingredients</label>
        <div id="ingredientsTable"></div>
      </div>

      <textarea class="form-control mb-2" id="recipeInstructionsInput" rows="4" placeholder="Instructions"></textarea>

      <div class="d-flex gap-2">
        <button class="btn btn-primary" onclick="saveRecipe()">Add Recipe</button>
        <button class="btn btn-outline-secondary" onclick="toggleRecipeForm()">Cancel</button>
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
      parseBtn.className = 'btn btn-info btn-sm mt-2';
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
    parseBtn.className = 'btn btn-info btn-sm mt-2';
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

  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const name = inputs[0]?.value.trim();
    const qty = inputs[1]?.value.trim();
    const unit = inputs[2]?.value.trim();

    if (name && qty && unit) {
      ingredients.push({ name, quantity: qty, unit });
    }
  });

  if (!name || !instructions || ingredients.length === 0) {
    alert("Please fill out all fields and include at least one ingredient.");
    return;
  }

  const recipe = {
    name,
    instructions,
    ingredients,
    timestamp: new Date()
  };

  db.collection('recipes').add(recipe)
    .then(docRef => {
      console.log("✅ Recipe added with ID:", docRef.id);
      toggleRecipeForm(); // Collapse the form
      loadRecipesFromFirestore(); // Refresh list (if applicable)
    })
    .catch(error => {
      console.error("❌ Error adding recipe:", error);
    });
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
      createIngredientRow(); // ← THIS is the important line
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
  view.innerHTML = `
    <h5 class="mb-3">🕘 Recipe History</h5>
    <input type="text" class="form-control mb-3" id="historySearch" placeholder="Search history..." oninput="filterHistory()" />
    <div id="historyList">Loading...</div>
  `;

  db.collection("history").orderBy("timestamp", "desc").get().then(snapshot => {
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

  if (!search) {
    displayRecipes(recipes); // assuming you store the original list
    return;
  }

  const filtered = recipes.filter(recipe => {
    return recipe.ingredients?.some(ing => {
      if (typeof ing === 'string') {
        return ing.toLowerCase().includes(search);
      } else if (typeof ing === 'object' && ing.name) {
        return ing.name.toLowerCase().includes(search);
      }
      return false;
    });
  });

  displayRecipes(filtered);
}


function displayRecipes(list, containerId = 'recipeResults') {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<p class="text-muted">No matching recipes found.</p>';
    return;
  }

  list.forEach(r => {
    const card = document.createElement('div');
    card.className = 'card mb-3 shadow-sm';

    const body = document.createElement('div');
    body.className = 'card-body';

    // Title and delete button container
    const titleRow = document.createElement('div');
    titleRow.className = 'd-flex justify-content-between align-items-center mb-3';

    // Styled title badge
    const title = document.createElement('span');
    title.className = 'px-3 py-2 bg-warning text-dark fs-5';
    title.textContent = r.name;

    // Delete button (unchanged)
    const deleteArea = document.createElement('div');
    deleteArea.className = 'delete-area d-flex justify-content-center align-items-center border rounded p-2 bg-light';
    deleteArea.style.minWidth = '80px';
    deleteArea.style.height = '60px';
    deleteArea.innerHTML = `
      <button class="btn btn-sm btn-outline-danger delete-btn" onclick="confirmDeleteRecipe('${r.id}', this)">🗑️</button>
    `;

    titleRow.appendChild(title);
    titleRow.appendChild(deleteArea);

    // Ingredient Table
    const ingredientsHeader = document.createElement('p');
    ingredientsHeader.innerHTML = '<strong>Ingredients:</strong>';

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
        nameTd.textContent = i.name || i;

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

    // Instructions
    const instructions = document.createElement('p');
    instructions.innerHTML = `<strong>Instructions:</strong> ${r.instructions}`;

    // "Mark as Made" Button
    const madeBtn = document.createElement('button');
    madeBtn.className = 'btn btn-success btn-sm';
    madeBtn.textContent = 'Mark as Made';
    madeBtn.onclick = () => markAsMade(r.name);

    // Append all
    body.appendChild(titleRow);
    body.appendChild(ingredientsHeader);
    body.appendChild(table);
    body.appendChild(instructions);
    body.appendChild(madeBtn);
    card.appendChild(body);
    container.appendChild(card);
  });
}


function markAsMade(recipeName) {
  // Find the card for this recipe and inject the note form
  const cards = document.querySelectorAll('.card');

  cards.forEach(card => {
    const title = card.querySelector('.card-title');
    if (title && title.textContent.trim().startsWith(recipeName))
      {
      // Prevent duplicates
      if (card.querySelector('.mark-made-form')) return;

      const form = document.createElement('div');
      form.className = 'mt-3 mark-made-form';
      form.innerHTML = `
        <div class="border rounded p-3 bg-light">
          <strong class="d-block mb-2">📝 Add Notes</strong>
          <textarea class="form-control mb-2" placeholder="Notes (optional)" rows="2"></textarea>
          <div class="d-flex gap-2">
            <button class="btn btn-success btn-sm">Save</button>
            <button class="btn btn-outline-secondary btn-sm">Cancel</button>
          </div>
        </div>
      `;

      // Handle Save
      form.querySelector('.btn-success').onclick = () => {
        const notes = form.querySelector('textarea').value;
        db.collection("history").add({
          recipe: recipeName,
          timestamp: new Date().toISOString(),
          notes: notes || ''
        }).then(() => {
          form.innerHTML = `
            <div class="text-success fw-bold d-flex align-items-center gap-2">
              <span>✅ Marked as made!</span>
            </div>
          `;
          setTimeout(() => form.remove(), 2000);
        }).catch(err => {
          console.error("Error saving history:", err);
          alert("Failed to save entry.");
        });
      };

      // Handle Cancel
      form.querySelector('.btn-outline-secondary').onclick = () => form.remove();

      card.appendChild(form);
    }
  });
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
      <button class="btn btn-sm btn-danger">Confirm</button>
      <button class="btn btn-sm btn-outline-secondary">Cancel</button>
    </div>
  `;

  // Confirm
  confirmBox.querySelector('.btn-danger').onclick = () => {
    db.collection("recipes").doc(id).delete().then(() => {
      loadRecipesFromFirestore();
    }).catch(err => {
      console.error("Error deleting recipe:", err);
      alert("Failed to delete recipe.");
    });
  };

  // Cancel
  confirmBox.querySelector('.btn-outline-secondary').onclick = () => {
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
    notes: notes || ''
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
  db.collection("recipes").get().then(snapshot => {
    recipes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    console.log("Loaded recipes:", recipes); // Debug line
    showRecipeFilter(); // Renders the recipes
  }).catch(err => {
    console.error("Error loading recipes from Firestore:", err);
  });
}



let ingredientsData = [];

async function showIngredients() {
    const view = document.getElementById('mainView');
    view.innerHTML = `
      <h5 class="mb-3">🧂 Ingredients Repository</h5>
      <input type="text" class="form-control mb-3" id="ingredientSearch" placeholder="Search ingredient..." oninput="filterIngredients()" />
  
      <button class="btn btn-success mb-3" onclick="toggleAddIngredient()">➕ Add Ingredient</button>
      
      <div id="addIngredientForm" class="mb-4" style="display: none;">
        <div class="card card-body">
          <input class="form-control mb-2" id="newIngName" placeholder="Name" />
          <input class="form-control mb-2" id="newIngComponents" placeholder="Components (comma separated)" />
          <input class="form-control mb-2" id="newIngUnit" placeholder="Unit (e.g. oz, lb)" />
          <input class="form-control mb-2" id="newIngCost" placeholder="Cost (e.g. 1.50)" type="number" step="0.01" />
          <input class="form-control mb-2" id="newIngStore" placeholder="Store URL" />
          <button class="btn btn-primary" onclick="addIngredient()">Add</button>
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
      <p>🧬 <strong>Made of:</strong> ${item.components.length ? item.components.join(', ') : '—'}</p>
      <p>📏 <strong>Unit:</strong> ${item.unit}</p>
      <p>💲 <strong>Cost:</strong> $${item.cost.toFixed(2)}</p>
      <a href="${item.store}" class="btn btn-sm btn-outline-primary" target="_blank">🛒 View in Store</a>
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

  
window.onload = () => {
  loadRecipesFromFirestore();
};
