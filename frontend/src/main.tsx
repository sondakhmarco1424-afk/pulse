import React, { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public declare readonly props: Readonly<Props>;

  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught React error:", error, errorInfo);
  }

  public handleReset = () => {
    try {
      localStorage.clear();
    } catch (e) {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, backgroundColor: '#0A0A0B', color: '#fff', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#f43f5e', marginBottom: 12 }}>Application Error</h2>
          <p style={{ color: '#a1a1aa', fontSize: 14, marginBottom: 16 }}>
            An uncaught exception occurred while rendering the application.
          </p>
          <pre style={{ backgroundColor: '#18181b', padding: 16, borderRadius: 8, color: '#f43f5e', overflow: 'auto', fontSize: 12 }}>
            {this.state.error?.stack || this.state.error?.toString()}
          </pre>
          <button
            onClick={this.handleReset}
            style={{ marginTop: 24, padding: '10px 20px', backgroundColor: '#10b981', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Clear Cache & Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
