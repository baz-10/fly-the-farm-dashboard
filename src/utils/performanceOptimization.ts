/**
 * Performance optimization utilities for JSA system
 * Optimizes handling of large hazard datasets and complex risk calculations
 */

import { JSASystemRecord, JSAHazard, RiskLevel } from '../types/jsa';
import { useMemo, useCallback, useRef } from 'react';

/**
 * Debounce utility for performance optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate?: boolean
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };

    const callNow = immediate && !timeout;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(later, wait);

    if (callNow) {
      func(...args);
    }
  };
}

/**
 * Throttle utility for limiting expensive operations
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Memoized risk calculation for large hazard arrays
 */
export const calculateOverallRisk = (hazards: JSAHazard[]) => {
  if (!hazards || hazards.length === 0) {
    return {
      highestRiskLevel: 'low' as RiskLevel,
      totalHazards: 0,
      lowRiskHazards: 0,
      mediumRiskHazards: 0,
      highRiskHazards: 0,
      extremeRiskHazards: 0,
      requiresCRPApproval: false,
      riskDistribution: { low: 0, medium: 0, high: 0, extreme: 0 },
      averageRiskScore: 0
    };
  }

  // Count hazards by risk level
  const riskCounts = hazards.reduce((acc, hazard) => {
    acc[hazard.riskLevel] = (acc[hazard.riskLevel] || 0) + 1;
    return acc;
  }, {} as Record<RiskLevel, number>);

  // Fill in missing risk levels with 0
  const riskDistribution = {
    low: riskCounts.low || 0,
    medium: riskCounts.medium || 0,
    high: riskCounts.high || 0,
    extreme: riskCounts.extreme || 0
  };

  // Determine highest risk level
  let highestRiskLevel: RiskLevel = 'low';
  if (riskDistribution.extreme > 0) highestRiskLevel = 'extreme';
  else if (riskDistribution.high > 0) highestRiskLevel = 'high';
  else if (riskDistribution.medium > 0) highestRiskLevel = 'medium';

  // Calculate average risk score for analytics
  const riskScores = {
    low: 1,
    medium: 2,
    high: 3,
    extreme: 4
  };

  const totalScore = hazards.reduce((sum, hazard) =>
    sum + riskScores[hazard.riskLevel], 0
  );
  const averageRiskScore = totalScore / hazards.length;

  return {
    highestRiskLevel,
    totalHazards: hazards.length,
    lowRiskHazards: riskDistribution.low,
    mediumRiskHazards: riskDistribution.medium,
    highRiskHazards: riskDistribution.high,
    extremeRiskHazards: riskDistribution.extreme,
    requiresCRPApproval: riskDistribution.high > 0 || riskDistribution.extreme > 0,
    riskDistribution,
    averageRiskScore: Math.round(averageRiskScore * 100) / 100
  };
};

/**
 * Optimized hazard filtering for large datasets
 */
export const createHazardFilters = () => {
  const filterByRiskLevel = (hazards: JSAHazard[], riskLevel: RiskLevel): JSAHazard[] => {
    return hazards.filter(hazard => hazard.riskLevel === riskLevel);
  };

  const filterByCategory = (hazards: JSAHazard[], category: string): JSAHazard[] => {
    return hazards.filter(hazard => hazard.category === category);
  };

  const filterByMitigationStatus = (hazards: JSAHazard[], hasMitigations: boolean): JSAHazard[] => {
    return hazards.filter(hazard => {
      const validMitigations = hazard.mitigations.filter(m => m.trim().length > 0);
      return hasMitigations ? validMitigations.length > 0 : validMitigations.length === 0;
    });
  };

  const searchHazards = (hazards: JSAHazard[], searchTerm: string): JSAHazard[] => {
    if (!searchTerm.trim()) return hazards;

    const term = searchTerm.toLowerCase();
    return hazards.filter(hazard =>
      hazard.title.toLowerCase().includes(term) ||
      hazard.description.toLowerCase().includes(term) ||
      hazard.category.toLowerCase().includes(term)
    );
  };

  return {
    filterByRiskLevel,
    filterByCategory,
    filterByMitigationStatus,
    searchHazards
  };
};

/**
 * Virtualization helper for large hazard lists
 */
export const createVirtualizedList = <T>(items: T[], itemHeight: number, containerHeight: number) => {
  const getVisibleItems = (scrollTop: number) => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight) + 1,
      items.length
    );

    return {
      startIndex,
      endIndex,
      visibleItems: items.slice(startIndex, endIndex),
      totalHeight: items.length * itemHeight,
      offsetY: startIndex * itemHeight
    };
  };

  return { getVisibleItems };
};

/**
 * Batch processing for large JSA operations
 */
export const processBatchOperations = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10,
  delayBetweenBatches: number = 10
): Promise<R[]> => {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Small delay to prevent blocking the UI
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
};

/**
 * React hooks for performance optimization
 */

/**
 * Optimized JSA calculation hook
 */
export const useMemoizedJSACalculation = (jsa: JSASystemRecord) => {
  return useMemo(() => {
    const riskCalculation = calculateOverallRisk(jsa.hazards);

    const completionProgress = jsa.hazards.length === 0 ? 0 :
      (jsa.hazards.filter(h =>
        h.title.trim() &&
        h.description.trim() &&
        h.mitigations.filter(m => m.trim()).length > 0
      ).length / jsa.hazards.length) * 100;

    const validationStatus = {
      hasRequiredFields: !!(jsa.responsiblePerson.name &&
                          jsa.responsiblePerson.licenseNumber &&
                          jsa.emergencyContacts.primary.name &&
                          jsa.emergencyContacts.primary.phone),
      hasValidHazards: jsa.hazards.length > 0,
      needsCRPApproval: riskCalculation.requiresCRPApproval,
      hasCRPSignature: !!jsa.signatures.crp
    };

    return {
      riskCalculation,
      completionProgress,
      validationStatus,
      isReadyForSubmission: validationStatus.hasRequiredFields &&
                           validationStatus.hasValidHazards &&
                           (!validationStatus.needsCRPApproval || validationStatus.hasCRPSignature)
    };
  }, [jsa]);
};

/**
 * Debounced validation hook
 */
export const useDebouncedValidation = <T>(
  validationFn: (data: T) => void,
  delay: number = 300
) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback((data: T) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      validationFn(data);
    }, delay);
  }, [validationFn, delay]);
};

/**
 * Optimized hazard search hook
 */
export const useOptimizedHazardSearch = (hazards: JSAHazard[]) => {
  const filters = useMemo(() => createHazardFilters(), []);

  const searchHazards = useCallback((
    searchTerm: string,
    riskLevelFilter?: RiskLevel,
    categoryFilter?: string
  ) => {
    let filteredHazards = hazards;

    // Apply search term filter
    if (searchTerm.trim()) {
      filteredHazards = filters.searchHazards(filteredHazards, searchTerm);
    }

    // Apply risk level filter
    if (riskLevelFilter) {
      filteredHazards = filters.filterByRiskLevel(filteredHazards, riskLevelFilter);
    }

    // Apply category filter
    if (categoryFilter) {
      filteredHazards = filters.filterByCategory(filteredHazards, categoryFilter);
    }

    return filteredHazards;
  }, [hazards, filters]);

  return { searchHazards };
};

/**
 * Performance monitoring utility
 */
export const performanceMonitor = {
  startTiming: (label: string): (() => number) => {
    const startTime = performance.now();
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      console.log(`${label}: ${duration.toFixed(2)}ms`);
      return duration;
    };
  },

  measureAsync: async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
    const endTiming = performanceMonitor.startTiming(label);
    try {
      const result = await operation();
      endTiming();
      return result;
    } catch (error) {
      endTiming();
      throw error;
    }
  },

  measureSync: <T>(label: string, operation: () => T): T => {
    const endTiming = performanceMonitor.startTiming(label);
    try {
      const result = operation();
      endTiming();
      return result;
    } catch (error) {
      endTiming();
      throw error;
    }
  }
};

/**
 * Memory management for large JSA datasets
 */
export const memoryManager = {
  clearUnusedJSAData: (
    activeJSAIds: string[],
    jsaCache: Map<string, JSASystemRecord>
  ): Map<string, JSASystemRecord> => {
    const cleanedCache = new Map();

    activeJSAIds.forEach(id => {
      if (jsaCache.has(id)) {
        cleanedCache.set(id, jsaCache.get(id));
      }
    });

    return cleanedCache;
  },

  optimizeHazardStorage: (hazards: JSAHazard[]): JSAHazard[] => {
    // Remove empty mitigations and normalize data
    return hazards.map(hazard => ({
      ...hazard,
      mitigations: hazard.mitigations.filter(m => m.trim().length > 0),
      title: hazard.title.trim(),
      description: hazard.description.trim()
    }));
  }
};