import React, { Component, ReactNode } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  AlertTitle,
  Paper,
} from '@mui/material';
import { ErrorOutline as ErrorIcon, Refresh as RefreshIcon } from '@mui/icons-material';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <Paper
          sx={{
            p: 3,
            textAlign: 'center',
            border: '1px solid',
            borderColor: 'error.main',
            bgcolor: 'error.lighter'
          }}
        >
          <Alert
            severity="error"
            icon={<ErrorIcon />}
            sx={{ mb: 2 }}
          >
            <AlertTitle>Something went wrong</AlertTitle>
            {this.props.fallbackMessage || 'An unexpected error occurred in this component.'}
          </Alert>

          {this.state.error && process.env.NODE_ENV === 'development' && (
            <Box sx={{ mt: 2, mb: 2, textAlign: 'left' }}>
              <Typography variant="caption" component="pre" sx={{
                bgcolor: 'grey.100',
                p: 1,
                borderRadius: 1,
                fontSize: '0.75rem',
                overflow: 'auto'
              }}>
                {this.state.error.toString()}
              </Typography>
            </Box>
          )}

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={this.handleRetry}
            sx={{ mt: 1 }}
          >
            Try Again
          </Button>
        </Paper>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;