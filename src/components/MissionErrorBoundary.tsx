import React, { Component, ReactNode } from 'react';
import { isDevelopmentEnvironment } from '../config/environment';

interface MissionErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorId?: string;
  retryCount: number;
}

interface MissionErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
  maxRetries?: number;
  onError?: (error: Error, errorId: string) => void;
}

class MissionErrorBoundary extends Component<MissionErrorBoundaryProps, MissionErrorBoundaryState> {
  private retryTimeout?: NodeJS.Timeout;

  constructor(props: MissionErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<MissionErrorBoundaryState> {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.error('[MissionErrorBoundary] Error caught:', errorId, error);

    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorId = this.state.errorId || 'unknown';
    console.error('[MissionErrorBoundary] Error details:', {
      errorId,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });

    // Report error to external service if callback provided
    this.props.onError?.(error, errorId);

    // Auto-retry for recoverable errors (not validation errors)
    const maxRetries = this.props.maxRetries || 3;
    if (this.state.retryCount < maxRetries && this.isRecoverableError(error)) {
      this.scheduleRetry();
    }
  }

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  private isRecoverableError(error: Error): boolean {
    const recoverablePatterns = [
      'Network error',
      'Failed to fetch',
      'localStorage is not available',
      'Failed to save',
      'Failed to load',
      'Timeout'
    ];

    return recoverablePatterns.some(pattern =>
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  private scheduleRetry = () => {
    const retryDelay = Math.min(1000 * Math.pow(2, this.state.retryCount), 10000); // Exponential backoff, max 10s

    this.retryTimeout = setTimeout(() => {
      this.setState(prevState => ({
        hasError: false,
        error: undefined,
        errorId: undefined,
        retryCount: prevState.retryCount + 1
      }));
    }, retryDelay);
  };

  private handleManualRetry = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorId: undefined,
      retryCount: 0
    });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleManualRetry);
      }

      return (
        <div className="mission-error-boundary" style={{
          padding: '20px',
          border: '1px solid #ff6b6b',
          borderRadius: '8px',
          backgroundColor: '#fff5f5',
          margin: '20px 0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{
              width: '20px',
              height: '20px',
              backgroundColor: '#ff6b6b',
              borderRadius: '50%',
              marginRight: '12px'
            }} />
            <h3 style={{ margin: 0, color: '#d63031' }}>
              Mission System Error
            </h3>
          </div>

          <p style={{ color: '#636e72', marginBottom: '16px' }}>
            Something went wrong with the mission management system. This error has been logged.
          </p>

          <details style={{ marginBottom: '16px' }}>
            <summary style={{ cursor: 'pointer', color: '#636e72' }}>
              Error Details (ID: {this.state.errorId})
            </summary>
            <pre style={{
              background: '#f8f9fa',
              padding: '12px',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '12px',
              color: '#2d3436',
              marginTop: '8px'
            }}>
              {this.state.error.message}
              {isDevelopmentEnvironment() && this.state.error.stack && (
                <>
                  {'\n\nStack trace:\n'}
                  {this.state.error.stack}
                </>
              )}
            </pre>
          </details>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={this.handleManualRetry}
              style={{
                padding: '8px 16px',
                backgroundColor: '#00b894',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Try Again
            </button>

            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                backgroundColor: '#636e72',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Refresh Page
            </button>
          </div>

          {this.state.retryCount > 0 && (
            <p style={{
              fontSize: '12px',
              color: '#636e72',
              marginTop: '12px',
              marginBottom: 0
            }}>
              Retry attempts: {this.state.retryCount}
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default MissionErrorBoundary;
