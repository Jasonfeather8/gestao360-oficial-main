import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { installGlobalDiagnosticLogging } from './services/diagnosticLogger';
import './index.css';

installGlobalDiagnosticLogging();

// Diagnóstico temporário: remover depois de identificar a origem do aviso de chave duplicada.
const consoleErrorOriginal = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('same key')) {
    const argumentosExtras = args.slice(1).map((argumento) => {
      if (argumento instanceof Error) return argumento.stack;
      if (typeof argumento === 'string') return argumento;
      try {
        return JSON.stringify(argumento);
      } catch {
        return String(argumento);
      }
    });
    consoleErrorOriginal.call(console, '[DIAG-KEY]', ...argumentosExtras, 'stack:', new Error('diag').stack);
  }
  consoleErrorOriginal.apply(console, args);
};

createRoot(document.getElementById('root')!).render(

  <StrictMode>
    <App />
  </StrictMode>,
);
