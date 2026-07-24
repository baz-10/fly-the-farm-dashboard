import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Typography, Button, Box, Card, CardContent } from '@mui/material';
import { Error as ErrorIcon, Refresh } from '@mui/icons-material';
import { isDevelopmentEnvironment } from '../config/environment';

interface Props {
  children?: ReactNode;
  fallbackComponent?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * JSA-specific error boundary to prevent system crashes during critical safety operations
 * This ensures that safety analysis system failures are handled gracefully without
 * compromising aviation safety compliance
 */
export default class JSAErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details for debugging while maintaining system stability
    console.error('JSA Error Boundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo
    });

    // In production, this would be sent to error monitoring service
    // For now, we ensure the error doesn't crash the safety system
  }

  handleRefresh = () => {
    // Reset error state and reload the page to restore functionality
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });

    // Force page reload to ensure clean state
    window.location.reload();
  };

  handleGoBack = () => {
    // Navigate back to safety dashboard
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      // Render custom fallback UI for JSA system errors
      if (this.props.fallbackComponent) {
        return this.props.fallbackComponent;
      }

      return (
        <Box sx={{ maxWidth: 800, margin: '2rem auto', p: 3 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <ErrorIcon sx={{ mr: 2, fontSize: 32, color: 'error.main' }} />
                <Typography variant="h4" color="error.main">
                  JSA System Error
                </Typography>
              </Box>

              <Alert severity="error" sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Critical Safety System Error
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  The Job Safety Analysis system has encountered an unexpected error. This safety-critical
                  system must be restored before continuing with aviation operations.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Error: {this.state.error?.message || 'Unknown error occurred'}
                </Typography>
              </Alert>

              <Box sx={{ bgcolor: 'warning.light', p: 2, borderRadius: 1, mb: 3 }}>
                <Typography variant="body2" fontWeight="bold" color="warning.dark">
                  ⚠️ Aviation Safety Notice
                </Typography>
                <Typography variant="body2" color="warning.dark">
                  Do not proceed with drone operations until the JSA system has been restored and
                  safety analysis has been completed according to regulatory requirements.
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Refresh />}
                  onClick={this.handleRefresh}
                >
                  Refresh System
                </Button>
                <Button
                  variant="outlined"
                  onClick={this.handleGoBack}
                >
                  Return to Dashboard
                </Button>
              </Box>

              {isDevelopmentEnvironment() && this.state.error && (
                <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Development Error Details:
                  </Typography>
                  <Typography variant="body2" component="pre" sx={{ fontSize: '0.75rem', overflow: 'auto' }}>
                    {this.state.error.stack}
                  </Typography>
                  {this.state.errorInfo && (
                    <Typography variant="body2" component="pre" sx={{ fontSize: '0.75rem', overflow: 'auto', mt: 1 }}>
                      {this.state.errorInfo.componentStack}
                    </Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      );
    }

    return this.props.children;
  }
}
