# Lumina | Lifewood Overview

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

## Dashboard Output Modes
There are two primary ways a dashboard file is generated and presented to the user:
1. **Conversational Output (Talk with Lumina)**: As the user chats with the AI, the AI agent dynamically builds and refines the report inline within the chat interface. The user can see live, interactive previews of their data evolving as they ask questions, complete with dynamic filtering and premium hover physics.
2. **Studio View Output**: A dedicated workspace mode that allows users to quickly generate a fixed, highly-polished dashboard preview outside of a conversational flow. This mode provides a focused, immediate visual confirmation of the dataset before exporting to Power BI.
