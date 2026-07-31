# Lumina | Lifewood Overview

## The Name "Lumina"
The name **Lumina** is derived from the Latin plural of *lumen*, meaning lights, brightness, or openings. In the context of this project, raw production data can often feel like a dark, impenetrable void. Lumina serves to pierce through that darkness—illuminating complex datasets and transforming them into clear, actionable insights through beautiful, immediate visualization.

## What the Project Does
Lumina | Lifewood is an end-to-end AI agent integrated with WhatsApp via OpenClaw, designed to automate production plan data visualization. The system seamlessly ingests Excel-based production plans from users via WhatsApp, processes the data through an automated ETL pipeline, and generates live Power BI datasets (.pbip). It features an immersive, glassmorphism-inspired web dashboard for instant visualization and tracking of key performance indicators (KPIs) such as Target vs. Actual quantities, hours, and completion rates.

## Tech Stack
### Frontend (Web Dashboard)
- **Next.js & React**: Core framework and UI library.
- **TypeScript**: For type-safe frontend development.
- **GSAP**: For fluid micro-animations and a premium glassmorphism UI.
- **Recharts**: For live data visualizations and dynamic chart previews.
- **Vanilla CSS**: For custom styling and aesthetic control.

### Backend (Data & AI Integration)
- **Python**: Core language for backend logic and ETL pipelines.
- **FastMCP**: To expose Model Context Protocol (MCP) tools for the AI agent.

### Storage & Database
- **Supabase**: PostgreSQL database management (users, conversations) and file hosting for generated datasets.

### Integrations
- **OpenClaw**: Handles the WhatsApp channel gateway and AI conversational interface. Rather than running a local AI model, it routes requests by shuffling between various free-tier external AI models to process conversations efficiently without local overhead.
- **Power BI REST API**: Used to sync the generated PBIP datasets for live organization-wide reporting.

## Key Features
- **WhatsApp Integration via OpenClaw**: Users can upload Excel-based production plans directly via WhatsApp. The system leverages OpenClaw to handle the conversational flow and process user requests efficiently by utilizing various free-tier external AI models.
- **Automated ETL & PBIP Generation**: The Python backend instantly processes uploaded spreadsheets, performs ETL, calculates KPIs, and packages the data into deployable Power BI (.pbip) datasets.
- **Immersive Glassmorphism UI**: Built with Next.js, Vanilla CSS, and GSAP, the frontend provides a breathtaking, highly interactive, frosted-glass dashboard that rivals native applications.
- **Live Data Syncing**: The dashboard offers deep cross-filtering. Selecting any chart element or table row instantly updates KPI cards and other visuals to reflect the filtered data.

## Dashboard Output Modes & Generation
Lumina provides three distinct avenues for processing data and rendering dashboards:
1. **Native Website Chatbot (Talk with Lumina)**: A highly iterative, conversational workflow. Rather than a one-shot output, the native web agent dynamically builds and refines the report inline within the chat interface. Users see live, interactive previews evolve as they ask questions or request tweaks, complete with dynamic cross-filtering and premium hover physics.
2. **WhatsApp Chatbot (via OpenClaw)**: A streamlined "in-and-out" workflow. Users send their Excel plans via WhatsApp, and the system processes it efficiently. The resulting output relies on the rigid, highly-polished aesthetic of the Studio view, ensuring rapid delivery without the need for iterative back-and-forth on a mobile device.
3. **Studio View Output**: A dedicated workspace mode on the website. It serves as a rapid "in-and-out" generation tool outside of a conversational flow. It provides a focused, immediate visual confirmation of the dataset, which can then be further customized within the website environment before exporting to Power BI.
