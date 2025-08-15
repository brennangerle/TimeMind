# Overview

This is a time tracking application that uses AI to parse natural language input into structured time entries and integrates with ClickUp for project management. The application features a modern web interface built with React and a Node.js/Express backend that leverages Google's Gemini AI for intelligent text parsing.

The core functionality allows users to input time tracking information in natural language (e.g., "worked 3 hours on project X yesterday") and automatically converts it into structured time entries with project matching, duration calculation, and date parsing.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query for server state and local React state for UI state
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with JSON communication
- **Error Handling**: Centralized error middleware with structured error responses
- **Development**: Hot reloading with Vite integration in development mode

## Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Connection**: Neon Database serverless PostgreSQL adapter
- **Fallback Storage**: In-memory storage implementation for development/testing

## Authentication and Authorization
- **Current State**: Basic demo user system (development phase)
- **Session Management**: Express session handling prepared for future implementation
- **User Model**: Username/password authentication with ClickUp API integration fields

## External Service Integrations

### AI Processing
- **Service**: Google Gemini AI (Gemini 2.5 Pro model)
- **Purpose**: Natural language parsing of time tracking inputs
- **Features**: 
  - Multi-entry parsing from single input
  - Date interpretation (relative and absolute)
  - Duration extraction and normalization
  - Project name fuzzy matching
  - Confidence scoring for matches

### Project Management Integration
- **Service**: ClickUp API integration
- **Features**:
  - Workspace and project synchronization
  - Task matching and time entry creation
  - Real-time project data fetching
- **Configuration**: User-specific API keys and workspace IDs

### Development Tools
- **Replit Integration**: Custom Vite plugins for Replit environment
- **Error Handling**: Runtime error overlay for development
- **Code Navigation**: Cartographer plugin for enhanced development experience

## Design Patterns and Architectural Decisions

### Separation of Concerns
- **Shared Schema**: Common TypeScript types and Zod schemas between frontend and backend
- **Service Layer**: Dedicated service classes for external API interactions
- **Storage Abstraction**: Interface-based storage layer allowing multiple implementations

### Type Safety
- **End-to-End TypeScript**: Shared types between client and server
- **Database Types**: Drizzle ORM provides compile-time type safety
- **API Validation**: Zod schemas for request/response validation

### Scalability Considerations
- **Modular Architecture**: Clear separation between UI components, business logic, and data access
- **Async Processing**: Promise-based architecture for handling external API calls
- **Error Boundaries**: Structured error handling throughout the application stack

### Development Experience
- **Hot Reloading**: Vite integration for fast development cycles
- **Component Library**: Comprehensive UI component system with consistent styling
- **Path Aliases**: Simplified import statements with TypeScript path mapping