# SQL Visualizer

A high-performance, zero-login tool that instantly converts raw SQL Data Definition Language (DDL) into interactive, beautifully rendered Entity-Relationship (ER) diagrams. 

Built with a "CEO-level" aesthetic, this tool helps developers, database administrators, and architects visualize complex database schemas effortlessly.



## ✨ Key Features

* **Instant Visualization:** Paste your `CREATE TABLE` SQL statements and instantly see a generated ER diagram. No login or database connection required.
* **Rich IDE Experience:** Integrated **Monaco Editor** provides SQL syntax highlighting, line numbers, bracket matching, and a premium coding environment.
* **Interactive Canvas:** 
  * Hover over tables or columns to trace foreign key relationships while dimming unconnected nodes.
  * Fast client-side search instantly dims unrelated tables.
* **Smart Layouts:** Powered by **ELK.js** running in a Web Worker, allowing for complex layout algorithms (Layered Flow, Force-Directed, Radial, Tree) without blocking the UI.
* **Zero-Backend Sharing:** The current schema is continuously encoded into a Base64 URL hash, enabling instant sharing with colleagues via a simple link.
* **Auto-Save:** Built-in `localStorage` debounced saving prevents accidental data loss if the tab is closed.
* **Premium UI/UX:** Fully responsive, modern design built with Tailwind CSS v4, featuring seamless Dark & Light mode toggling.
* **Export:** Download high-quality, vector-perfect SVG, PDF, or PNG files of your diagrams.

## 🛠️ Technology Stack

* **Frontend Framework:** Next.js (React)
* **Canvas Engine:** React Flow (`@xyflow/react`)
* **Layout Engine:** ELK.js (Web Worker)
* **Code Editor:** Monaco Editor (`@monaco-editor/react`)
* **SQL Parser:** `pgsql-ast-parser`
* **Styling:** Tailwind CSS v4

## 🚀 Getting Started

### Prerequisites
* Node.js (v20+ recommended)
* npm, yarn, or pnpm

### Installation

1. Clone the repository and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`.

## 🤝 Roadmap
* **Smart Domain Grouping:** AI-powered heuristic clustering to automatically group tables into domains (e.g., Auth, Billing) using an LLM backend.
* **Multi-Dialect Support:** Expanded support for MySQL, SQLite, and SQL Server syntax.
