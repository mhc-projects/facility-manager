/**
 * CacheManager - Centralized cache management utility
 *
 * Provides immediate in-memory cache updates for sessionStorage,
 * ensuring UI always displays latest data without requiring page refresh.
 */

export const CacheManager = {
  keys: {
    PRICING: 'revenue_pricing_cache',
    BUSINESSES: 'revenue_businesses_cache',
    CALCULATIONS: 'revenue_calculations_cache',
    CACHE_TIME: 'revenue_cache_time',
  },

  /**
   * Update a specific field in cached business data
   * @param businessId - Business UUID
   * @param field - Field name to update
   * @param value - New value for the field
   */
  updateBusinessField(businessId: string, field: string, value: any) {
    try {
      const cached = sessionStorage.getItem(this.keys.BUSINESSES);
      if (!cached) {
        console.warn('[CacheManager] No cache found, skipping update');
        return;
      }

      const businesses = JSON.parse(cached);
      const index = businesses.findIndex((b: any) => b.id === businessId);

      if (index !== -1) {
        businesses[index][field] = value;
        sessionStorage.setItem(this.keys.BUSINESSES, JSON.stringify(businesses));
        console.log(`✅ [CacheManager] Cache updated: ${field} = ${value} for business ${businessId.slice(0, 8)}...`);
      } else {
        console.warn(`[CacheManager] Business ${businessId} not found in cache`);
      }
    } catch (error) {
      console.error('[CacheManager.updateBusinessField] Error:', error);
    }
  },

  /**
   * Update multiple fields at once for a business
   * @param businessId - Business UUID
   * @param fields - Object with field names and values
   */
  updateBusinessFields(businessId: string, fields: Record<string, any>) {
    try {
      const cached = sessionStorage.getItem(this.keys.BUSINESSES);
      if (!cached) {
        console.warn('[CacheManager] No cache found, skipping update');
        return;
      }

      const businesses = JSON.parse(cached);
      const index = businesses.findIndex((b: any) => b.id === businessId);

      if (index !== -1) {
        businesses[index] = { ...businesses[index], ...fields };
        sessionStorage.setItem(this.keys.BUSINESSES, JSON.stringify(businesses));
        console.log(`✅ [CacheManager] Cache updated: ${Object.keys(fields).join(', ')} for business ${businessId.slice(0, 8)}...`);
      } else {
        console.warn(`[CacheManager] Business ${businessId} not found in cache`);
      }
    } catch (error) {
      console.error('[CacheManager.updateBusinessFields] Error:', error);
    }
  },

  /**
   * Invalidate all cache entries
   */
  invalidateAll() {
    Object.values(this.keys).forEach(key => {
      sessionStorage.removeItem(key);
    });
    console.log('🗑️ [CacheManager] All cache invalidated');
  },

  /**
   * Invalidate only businesses cache
   */
  invalidateBusinesses() {
    sessionStorage.removeItem(this.keys.BUSINESSES);
    sessionStorage.removeItem(this.keys.CACHE_TIME);
    console.log('🗑️ [CacheManager] Businesses cache invalidated');
  },

  /**
   * Invalidate pricing cache
   */
  invalidatePricing() {
    sessionStorage.removeItem(this.keys.PRICING);
    sessionStorage.removeItem(this.keys.CACHE_TIME);
    console.log('🗑️ [CacheManager] Pricing cache invalidated');
  },

  /**
   * Broadcast cache invalidation to other tabs
   */
  broadcastInvalidation() {
    localStorage.setItem('cache-invalidate-timestamp', Date.now().toString());
    console.log('📡 [CacheManager] Broadcast: cache invalidation');
  },

  /**
   * Broadcast specific field update to other tabs
   * @param businessId - Business UUID
   * @param field - Field name
   * @param value - New value
   */
  broadcastFieldUpdate(businessId: string, field: string, value: any) {
    const update = {
      businessId,
      field,
      value,
      timestamp: Date.now()
    };
    // 다른 탭에 전달 (storage event는 같은 탭에서는 발생하지 않음)
    localStorage.setItem('cache-field-update', JSON.stringify(update));
    // 같은 탭에도 전달
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cache-field-update', { detail: update }));
    }
    console.log(`📡 [CacheManager] Broadcast: ${field} update for ${businessId.slice(0, 8)}...`);
  },

  /**
   * Get cached businesses data
   */
  getBusinesses(): any[] | null {
    try {
      const cached = sessionStorage.getItem(this.keys.BUSINESSES);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('[CacheManager.getBusinesses] Error:', error);
      return null;
    }
  },

  /**
   * Check if cache is still valid (within expiry time)
   * @param maxAge - Maximum age in milliseconds (default: 5 minutes)
   */
  isCacheValid(maxAge: number = 5 * 60 * 1000): boolean {
    try {
      const cacheTime = sessionStorage.getItem(this.keys.CACHE_TIME);
      if (!cacheTime) return false;

      const age = Date.now() - parseInt(cacheTime);
      return age < maxAge;
    } catch (error) {
      console.error('[CacheManager.isCacheValid] Error:', error);
      return false;
    }
  }
};
