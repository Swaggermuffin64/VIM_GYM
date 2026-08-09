# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is the frontend component of the vim-racing project, built with Create React App and TypeScript. It uses React 18+ with the latest TypeScript configuration and is part of a larger full-stack application that includes a TypeScript backend located at `../backend/`.

## Key Commands

### Development

- `npm start` - Start development server (runs on http://localhost:3000)
- `npm test` - Run test suite in interactive watch mode
- `npm run build` - Create production build in `build/` folder

### Testing

- `npm test` - Interactive test runner with Jest and React Testing Library
- `npm test -- --coverage` - Run tests with coverage report
- `npm test -- --watchAll=false` - Run tests once without watching

### TypeScript

- TypeScript compilation is handled automatically by react-scripts
- `tsc --noEmit` - Type check without emitting files (if needed manually)

## Architecture

### Project Structure

- `src/App.tsx` - Main application component (TypeScript + JSX)
- `src/index.tsx` - Application entry point with React 18+ createRoot API
- `src/react-app-env.d.ts` - TypeScript declarations for Create React App
- `tsconfig.json` - TypeScript configuration with strict mode enabled
- `public/` - Static assets and HTML template

### TypeScript Configuration

- Strict mode enabled for better type safety
- ES5 target with modern library support (DOM, ESNext)
- JSX transform: `react-jsx` (React 17+ transform)
- Module resolution: Node.js style
- Isolated modules for better build performance

### Testing Setup

- Jest configured via react-scripts with TypeScript support
- React Testing Library (@testing-library/react)
- TypeScript test files use `.test.tsx` or `.test.ts` extensions

## Development Context

This frontend is designed to work with the TypeScript backend located in `../backend/`. When making changes that involve API integration or cross-service communication, consider the backend implementation as well.

The project appears to be a vim-racing application, suggesting it may involve vim-style editing competitions or similar functionality. All components should be written in TypeScript for better type safety and developer experience.
