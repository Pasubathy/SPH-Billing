# SPH Software - Full-Stack Billing System

A premium hardware store billing and inventory management application designed to run on Windows environments. The system uses a native PowerShell HTTP server backend, serving files and REST JSON endpoints without external dependencies (like Node.js).

---

## 📁 Directory Structure

The project has been organized into a professional full-stack layout:

```text
SPH Software/
├── backend/
│   ├── server.ps1          # Native PowerShell-based web & REST API server
│   └── package.json        # Optional dependency configurations
├── db/
│   └── data.json           # JSON Database (Central source of truth)
├── docs/
│   └── README.md           # Documentation and guides
└── frontend/
    ├── css/
    │   └── style.css       # Core typography, components, and layout styling
    ├── js/
    │   ├── category.js     # Category management CRUD operations
    │   ├── units.js        # Measurement units CRUD operations
    │   ├── items.js        # Item inventory list page
    │   ├── create-item.js  # Add/Edit item form logic & tag-sticker preview
    │   ├── view-item.js    # Detailed item preview page
    │   └── sales.js        # Interactive POS billing & sales history
    ├── index.html          # Login and routing portal
    ├── items.html          # Item inventory grid/list dashboard
    ├── create-item.html    # Add/Edit item page
    ├── view-item.html      # Detailed item inspection page
    ├── units.html          # Measurement units manager
    └── sales.html          # POS Billing Screen & Invoice Explorer
```

---

## ⚙️ Architecture & Data Persistence

1. **Frontend**: Pure HTML, vanilla CSS (vibrant palettes, modern layout styling), and vanilla JavaScript. Communicates with the backend using the asynchronous `fetch` API.
2. **Backend**: A native PowerShell server running on port `3000`. It serves both static asset files (HTML, CSS, JS, images) and provides custom REST API endpoints at `/api/...`.
3. **Database**: Managed centrally under `db/data.json`. Operations like creating, updating, and deleting items, categories, units, customers, and sales records are persistent and saved to this JSON database.

### REST API Endpoints
* `GET /api/categories` & `POST /api/categories`
* `GET /api/units` & `POST /api/units`
* `GET /api/items` & `POST /api/items`
* `GET /api/customers` & `POST /api/customers`
* `GET /api/sales` & `POST /api/sales`
* `GET /api/invoice-counter` & `POST /api/invoice-counter`

---

## 🚀 How to Run the Application

To run the application locally on Windows, you only need PowerShell (no Node.js installation required):

1. Open PowerShell and navigate to the project directory:
   ```powershell
   cd "F:\MY Works\SPH Software"
   ```
2. Launch the backend server:
   ```powershell
   powershell -File backend/server.ps1
   ```
3. Open your web browser and navigate to:
   ```text
   http://127.0.0.1:3000
   ```

---

## 📝 Credentials
* **Username**: `SPH.admin`
* **Password**: `SPH@26`
