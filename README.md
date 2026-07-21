# Lumina | Lifewood 🌟

An end-to-end AI agent integrated with WhatsApp via **OpenClaw** to automate production plan data visualization. Built with a **Python FastMCP** backend and **Supabase**, it seamlessly ingests Excel plans and triggers live Power BI dataset refreshes via REST API for streamlined operations.

## ✨ Features
- **Immersive Web Dashboard**: A glassmorphism-inspired, high-performance UI built with Next.js and GSAP for fluid, stunning micro-animations.
- **WhatsApp Integration**: Interact seamlessly with your production plans directly through WhatsApp via OpenClaw.
- **Live Data Visualizations**: Instant chart previews (Target vs Actual, Completion Rates, Hours tracking) utilizing Recharts.
- **Automated Workflows**: Drop an Excel plan in the Studio and let Lumina handle the ETL pipeline and Power BI syncing automatically.
- **Robust Storage**: Leverages Supabase for secure dataset hosting and file management.

## 🛠️ Tech Stack
- **Frontend**: Next.js, React, TypeScript, GSAP (Animations), Recharts, Vanilla CSS
- **Backend**: Python, FastMCP, Supabase (Database/Storage)
- **Integrations**: WhatsApp via OpenClaw, Power BI REST API

## 📂 Project Structure
- `/lumina/website` - The Next.js glassmorphism frontend application.
- `/lumina/backend` - Python server powering data ingestion, ETL, and AI integration.

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18+)
- **Python** (3.10+)
- **Supabase** account and project
- **Power BI** account (for dataset API integration)

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd lumina/backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```
3. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up your `.env` file with your Supabase and Power BI credentials.
5. Start the FastMCP server:
   ```bash
   python app/server.py
   ```
   *The backend will run on `http://localhost:8001`.*

### Frontend Setup
1. Navigate to the website directory:
   ```bash
   cd lumina/website
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Ensure your `.env.local` file contains your `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Start the development server:
   ```bash
   npm run dev
   ```
   *The application will be live at `http://localhost:3000`.*
