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
        <input class="form-control mb-2" id="recipeIngredientsInput" placeholder="Ingredients (comma separated)" />
        <textarea class="form-control mb-2" id="recipeInstructionsInput" rows="4" placeholder="Instructions"></textarea>
        <div class="d-flex gap-2">
          <button class="btn btn-primary" onclick="saveRecipe()">Add Recipe</button>
          <button class="btn btn-outline-secondary" onclick="toggleRecipeForm()">Cancel</button>
        </div>

      </div>
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

<div id="photoPreviewContainer" class="mb-3"></div>


    <div id="recipeResults"></div>
  `;
  displayRecipes(recipes, 'recipeResults');
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
    preview.innerHTML = ''; // Clear any previous preview
    preview.appendChild(img);

    // 🔁 Run OCR
    runOCRFromImage(e.target.result);
  };

  reader.readAsDataURL(file);
}


function runOCRFromImage(src) {
  const preview = document.getElementById('photoPreviewContainer');
  const status = document.createElement('p');
  status.textContent = '🔍 Scanning text...';
  preview.appendChild(status);

  Tesseract.recognize(
    src,
    'eng',
    {
      logger: m => console.log(m) // Progress updates (optional)
    }
  ).then(({ data: { text } }) => {
    status.remove();
    console.log("🧠 OCR Result:\n", text);

    // Optionally show the extracted text
    const result = document.createElement('pre');
    result.textContent = text;
    result.className = 'bg-light p-2 border mt-2';
    preview.appendChild(result);

    // TODO: Parse this text into recipe structure!
  }).catch(err => {
    status.textContent = '❌ OCR failed.';
    console.error("OCR error:", err);
  });
}


function saveRecipe() {
  const name = document.getElementById('recipeNameInput').value.trim();
  const ingredientsText = document.getElementById('recipeIngredientsInput').value;
  const instructions = document.getElementById('recipeInstructionsInput').value.trim();

  if (!name || !ingredientsText || !instructions) {
    alert("Please fill out all fields.");
    return;
  }

  const ingredients = ingredientsText.split(',').map(i => i.trim()).filter(Boolean);

  db.collection("recipes").add({
    name,
    ingredients,
    instructions
  }).then(() => {
    toggleRecipeForm();
    loadRecipesFromFirestore(); // reloads and shows
  }).catch(err => {
    console.error("Error saving recipe:", err);
    alert("Failed to save recipe.");
  });
}



function toggleRecipeForm() {
  const form = document.getElementById('recipeForm');
  form.classList.toggle('open');

   // Clear fields when collapsing
   if (!form.classList.contains('open')) {
    document.getElementById('recipeNameInput').value = '';
    document.getElementById('recipeIngredientsInput').value = '';
    document.getElementById('recipeInstructionsInput').value = '';
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
  const query = document.getElementById('recipeSearch').value.toLowerCase().trim();
  if (!query) {
    displayRecipes(recipes, 'recipeResults');
    return;
  }

  const keywords = query.split(/\s+/);

  const filtered = recipes.filter(r => {
    const ingString = r.ingredients.join(' ').toLowerCase();
    return keywords.every(k => ingString.includes(k));
  });

  displayRecipes(filtered, 'recipeResults');
}

function displayRecipes(list, containerId = 'mainView') {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<p>No matching recipes found.</p>';
    return;
  }

  list.forEach(r => {
    const card = document.createElement('div');
    card.className = 'card';
    const body = document.createElement('div');
    body.className = 'card-body';
    body.innerHTML = `
      <h5 class="card-title d-flex justify-content-between align-items-center">
        ${r.name}
        <div class="delete-area d-flex justify-content-center align-items-center border rounded p-2 bg-light" style="min-width: 80px; height: 60px;">
          <button class="btn btn-sm btn-outline-danger delete-btn" onclick="confirmDeleteRecipe('${r.id}', this)">🗑️</button>
        </div>

      </h5>
      <p><strong>Ingredients:</strong> ${r.ingredients.join(', ')}</p>
      <p><strong>Instructions:</strong> ${r.instructions}</p>
      <button class="btn btn-success btn-sm" onclick="markAsMade('${r.name}')">Mark as Made</button>
    `;

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
