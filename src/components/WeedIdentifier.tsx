import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  alpha,
  useTheme,
  IconButton,
  Stack,
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ImageIcon from '@mui/icons-material/Image';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

interface IdentifyResult {
  identified: boolean;
  weedName: string;
  confidence: string;
  description: string;
  inDatabase: boolean;
  searchTerm: string;
}

export default function WeedIdentifier() {
  const theme = useTheme();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setError('Image must be under 4MB.');
      return;
    }

    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const identifyWeed = async () => {
    if (!preview) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Extract base64 and mime type from data URL
      const [header, base64Data] = preview.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';

      const response = await fetch('/api/identify-weed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data, mimeType }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${response.status})`);
      }

      const data: IdentifyResult = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to identify weed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const clearImage = () => {
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confidenceColor = (c: string) =>
    c === 'high' ? theme.palette.success.main :
    c === 'medium' ? theme.palette.warning.main :
    theme.palette.error.main;

  return (
    <Card
      elevation={0}
      sx={{
        border: `1.5px solid ${alpha(theme.palette.primary.main, 0.12)}`,
        borderRadius: '16px',
        overflow: 'hidden',
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '12px',
            bgcolor: alpha(theme.palette.secondary.main, 0.08),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CameraAltIcon sx={{ fontSize: 20, color: 'secondary.main' }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 700 }}>
              Identify a Weed
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Upload a photo and AI will identify the weed and suggest treatments
            </Typography>
          </Box>
        </Box>

        {!preview ? (
          <Box
            onClick={() => fileInputRef.current?.click()}
            sx={{
              border: `2px dashed ${alpha(theme.palette.primary.main, 0.2)}`,
              borderRadius: '12px',
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: alpha(theme.palette.primary.main, 0.4),
                bgcolor: alpha(theme.palette.primary.main, 0.02),
              },
            }}
          >
            <ImageIcon sx={{ fontSize: 48, color: alpha(theme.palette.text.secondary, 0.3), mb: 1.5 }} />
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
              Tap to upload a photo
            </Typography>
            <Typography variant="caption" color="text.secondary">
              JPG, PNG up to 4MB
            </Typography>
          </Box>
        ) : (
          <Box>
            <Box sx={{ position: 'relative', mb: 2 }}>
              <Box
                component="img"
                src={preview}
                alt="Uploaded weed"
                sx={{
                  width: '100%',
                  maxHeight: 300,
                  objectFit: 'cover',
                  borderRadius: '12px',
                  display: 'block',
                }}
              />
              <IconButton
                onClick={clearImage}
                size="small"
                sx={{
                  position: 'absolute', top: 8, right: 8,
                  bgcolor: 'rgba(0,0,0,0.5)', color: 'white',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>

            {!result && !loading && (
              <Button
                variant="contained"
                fullWidth
                startIcon={<SearchIcon />}
                onClick={identifyWeed}
                sx={{ borderRadius: '10px', py: 1.2, fontWeight: 700 }}
              >
                Identify This Weed
              </Button>
            )}

            {loading && (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <CircularProgress size={36} sx={{ mb: 1.5 }} />
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  Analysing image...
                </Typography>
              </Box>
            )}

            {result && (
              <Box sx={{ mt: 1 }}>
                {result.identified ? (
                  <Box>
                    <Box sx={{
                      display: 'flex', alignItems: 'center', gap: 1, mb: 1.5,
                      p: 2, borderRadius: '10px',
                      bgcolor: alpha(result.inDatabase ? theme.palette.success.main : theme.palette.warning.main, 0.06),
                      border: `1px solid ${alpha(result.inDatabase ? theme.palette.success.main : theme.palette.warning.main, 0.15)}`,
                    }}>
                      {result.inDatabase ? (
                        <CheckCircleIcon sx={{ color: 'success.main' }} />
                      ) : (
                        <HelpOutlineIcon sx={{ color: 'warning.main' }} />
                      )}
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body1" fontWeight={800}>
                          {result.weedName}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                          <Typography variant="caption" sx={{ color: confidenceColor(result.confidence), fontWeight: 700 }}>
                            {result.confidence.charAt(0).toUpperCase() + result.confidence.slice(1)} confidence
                          </Typography>
                          {result.inDatabase && (
                            <Typography variant="caption" color="success.main" fontWeight={600}>
                              &bull; In database
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                      {result.description}
                    </Typography>

                    <Stack spacing={1}>
                      {result.inDatabase && (
                        <Button
                          variant="contained"
                          fullWidth
                          startIcon={<SearchIcon />}
                          onClick={() => navigate(`/search?q=${encodeURIComponent(result.searchTerm)}`)}
                          sx={{ borderRadius: '10px', py: 1.2, fontWeight: 700 }}
                        >
                          View Treatments for {result.searchTerm}
                        </Button>
                      )}
                      <Button
                        variant="outlined"
                        fullWidth
                        onClick={clearImage}
                        sx={{ borderRadius: '10px', py: 1, fontWeight: 600 }}
                      >
                        Try Another Photo
                      </Button>
                    </Stack>
                  </Box>
                ) : (
                  <Box>
                    <Alert severity="info" sx={{ mb: 2, borderRadius: '10px' }}>
                      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                        Could not identify
                      </Typography>
                      <Typography variant="body2">
                        {result.description}
                      </Typography>
                    </Alert>
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={clearImage}
                      sx={{ borderRadius: '10px', py: 1, fontWeight: 600 }}
                    >
                      Try Another Photo
                    </Button>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2, borderRadius: '10px' }}>
            {error}
          </Alert>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </CardContent>
    </Card>
  );
}
