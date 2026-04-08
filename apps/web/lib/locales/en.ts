export const en = {
  meta: {
    title: "OmniList",
    description: "Create once, publish everywhere."
  },
  layout: {
    language: "Language",
    localeNames: {
      en: "English",
      uk: "Українська",
      ru: "Русский"
    }
  },
  common: {
    appName: "OmniList",
    account: "OmniList Account",
    or: "or",
    backToDashboard: "Back to dashboard",
    backToWorkspace: "Back to workspace",
    createProduct: "Create product",
    editProduct: "Edit product",
    manageChannels: "Manage channels",
    openProductWorkspace: "Open product workspace",
    saveProduct: "Save product",
    addFirstProduct: "Add first product",
    saveChannelSettings: "Save channel settings",
    saving: "Saving...",
    refreshing: "Refreshing...",
    type: "Type",
    region: "Region",
    accountLabel: "Account",
    notConnectedYet: "Not connected yet",
    score: "Score",
    skuLabel: "SKU",
    inStock: "in stock",
    recentJobs: "Recent jobs",
    publishing: "Publishing",
    canonicalProductModel: "Canonical product model",
    billing: "Billing",
    upgradeToPro: "Upgrade to Pro",
    managePlan: "Manage plan",
    currentPlan: "Current plan"
  },
  channels: {
    kindLabels: {
      store: "Store",
      marketplace: "Marketplace"
    },
    descriptions: {
      shopify: "Connected commerce channel and source catalog.",
      ebay: "Strong SMB marketplace with mature listing and taxonomy support.",
      etsy: "Marketplace with strong fit for handmade, niche, and creative products."
    }
  },
  statuses: {
    connected: "Connected",
    disconnected: "Disconnected",
    attentionRequired: "Needs attention",
    ready: "Ready",
    needsAttention: "Needs attention",
    queued: "Queued",
    processing: "Processing",
    completed: "Completed",
    partial: "Partial",
    failed: "Failed",
    published: "Published"
  },
  loginPage: {
    title: "Sign in to your seller workspace",
    description:
      "Your catalog, channel connections, and publish pipeline belong inside a private workspace, not a shared public page.",
    needAccount: "Need an account?",
    createOne: "Create one"
  },
  registerPage: {
    title: "Create your personal seller cabinet",
    description: "Registration now creates a private workspace so products and connected channels belong to the signed-in user.",
    alreadyHaveAccount: "Already have an account?",
    signIn: "Sign in"
  },
  authForm: {
    name: "Name",
    workspaceName: "Workspace name",
    email: "Email",
    password: "Password",
    oauthFailed: "OAuth sign-in failed",
    authFailed: "Authentication failed.",
    missingApi: "Run the API on localhost:4000 or set NEXT_PUBLIC_OMNILIST_API_URL.",
    pleaseWait: "Please wait...",
    signIn: "Sign in",
    createAccount: "Create account"
  },
  socialAuth: {
    continueWith: (providerName: string) => `Continue with ${providerName}`,
    notConfigured: (providerName: string) => `${providerName} not configured yet`
  },
  logoutButton: {
    signingOut: "Signing out...",
    signOut: "Sign out"
  },
  dashboard: {
    eyebrow: "OmniList MVP",
    title: "Create once. Publish with confidence.",
    description: (workspaceName: string) =>
      `${workspaceName} now has the first real seller workspace slice: canonical products, connected channels, multi-channel readiness, and clear publishing feedback before a seller hits publish.`,
    signedInAs: (email: string) => `Signed in as ${email}`,
    stats: {
      productsInCatalog: "Products in catalog",
      connectedChannels: "Connected channels",
      listingsReadyNow: "Listings ready now",
      productsRemaining: "Products remaining",
      listingsNeedingAttention: "Listings needing attention"
    },
    channelWorkspaceTitle: "Channel workspace",
    channelWorkspaceDescription: "Visibility into which destinations are healthy enough for publish operations.",
    manageChannel: (channelName: string) => `Manage ${channelName}`,
    catalogSnapshotTitle: "Catalog snapshot",
    catalogSnapshotDescription: "Each card shows cross-channel readiness before publication.",
    workspaceReadyTitle: "Your workspace is ready",
    workspaceReadyDescription: "No products yet. Create your first canonical product and then connect publish flows on top of it.",
    readyEverywhere: "Ready everywhere",
    channelsBlocked: (count: number) => `${count} channels blocked`,
    categoryMappingMissing: "Category mapping still missing",
    noIssuesDetected: "No issues detected for this channel.",
    issuesToReview: (count: number) => `${count} issues to review before publishing.`,
    publishCenterTitle: "Publish center",
    publishCenterDescription: "Recent async publish jobs across the workspace.",
    noPublishJobs: "No publish jobs yet. Open a product workspace to start publishing."
  },
  channelsPage: {
    eyebrow: "Channel workspace",
    title: "Connect selling destinations without leaving your cabinet.",
    description: (workspaceName: string) =>
      `${workspaceName} can manage marketplace state from one place: account reference, sync mode, and any follow-up note the team needs before publishing.`,
    connected: (count: number) => `Connected: ${count}`,
    needsAttention: (count: number) => `Needs attention: ${count}`,
    availableChannels: "Available channels",
    connectedNow: "Connected now",
    needAttention: "Need attention",
    manageConnections: "Manage connections",
    manageConnectionsDescription: "Save channel state now; full OAuth adapters will plug into this same workspace later."
  },
  channelManager: {
    status: "Status",
    externalAccountId: "External account ID",
    syncMode: "Sync mode",
    syncModeHint: "Examples: `listing_only`, `listing_and_inventory`, `catalog_and_inventory`.",
    internalNote: "Internal note",
    notePlaceholder: "Reauth needed, pending verification, connected by seller support, etc.",
    connectionGuidance: "Connection guidance",
    region: "Region",
    guidanceDescription: "Use this card to track seller account linkage before we wire the full OAuth/channel-specific adapter flow.",
    couldNotSave: "Could not save channel connection.",
    savedConnection: (channelName: string) => `Saved ${channelName} connection.`
  },
  newProductPage: {
    title: "Create product",
    description: "Start with the canonical product record. Channel-specific adaptation will be layered on top of this source model."
  },
  editProductPage: {
    title: "Edit product",
    description: "Update the canonical product data first. Readiness and publish quality will improve automatically per channel."
  },
  productEditor: {
    couldNotReadFile: "Could not read one of the selected image files.",
    missingApi: "Saving requires a running API and NEXT_PUBLIC_OMNILIST_API_URL.",
    couldNotSaveProduct: "Could not save the product.",
    reviewErrors: "Please review the highlighted fields.",
    validBasePrice: "Enter a valid non-negative number.",
    validQuantity: "Enter a valid non-negative whole number.",
    title: "Title",
    brand: "Brand",
    description: "Description",
    sku: "SKU",
    basePrice: "Base price",
    quantity: "Quantity",
    categoryId: "Category ID",
    categoryLabel: "Category label",
    categorySuggestions: "Suggested categories",
    categorySuggestionsHint: "OmniList can suggest internal categories from the product title, description, and attributes.",
    noCategorySuggestions: "No category suggestions yet. Add a clearer title or more descriptive copy.",
    useSuggestion: "Use suggestion",
    mappedCategoryPreview: "Channel category preview",
    channelOverrides: "Channel overrides",
    channelOverridesHint: "Override title, description, or price only when a specific marketplace needs a tailored listing.",
    overrideTitle: "Override title",
    overrideDescription: "Override description",
    overridePrice: "Override price",
    overrideSectionFor: (channelName: string) => `${channelName} override`,
    invalidOverridePrice: "Override price must be a valid non-negative number.",
    productPhotos: "Product photos",
    productPhotosHint: "Upload photos from your device. The first image is treated as the main image.",
    uploadedImages: "Uploaded images",
    noImagesUploaded: "No images uploaded yet.",
    variants: "Variants",
    variantsHint: "Add size, color, or other sellable combinations with their own SKU, stock, and price.",
    noVariantsConfigured: "No variants added yet.",
    addVariant: "Add variant",
    removeVariant: "Remove variant",
    variantN: (index: number) => `Variant ${index}`,
    variantSku: "Variant SKU",
    variantPrice: "Variant price",
    variantQuantity: "Variant quantity",
    optionName: "Option name",
    optionValue: "Option value",
    secondOptionName: "Second option name",
    secondOptionValue: "Second option value",
    variantSkuRequired: "Variant SKU is required.",
    variantPriceInvalid: "Variant price must be a valid non-negative number.",
    variantQuantityInvalid: "Variant quantity must be a valid non-negative whole number.",
    variantOptionPairInvalid: "Fill both option name and option value or leave both empty.",
    mainImage: "Main image",
    imageN: (index: number) => `Image ${index}`,
    remove: "Remove",
    material: "Material",
    color: "Color",
    primaryColor: "Primary color",
    productImageAlt: (title: string, index: number) => `${title || "Product"} image ${index}`,
    createProduct: "Create product"
  },
  productWorkspace: {
    description:
      "This workspace now combines validation-first editing with an async publish center, so sellers can inspect what is ready, launch a publish job, and then review channel-by-channel results.",
    readinessScore: "Readiness score",
    listingReady: "This listing is ready for this channel.",
    publishingDescription: "Async jobs let sellers publish now and inspect channel-level outcomes as they complete.",
    noProductJobs: "No publish jobs yet for this product.",
    canonicalDescription: "The source entity that future channel adapters will transform into external listings.",
    coreFields: "Core fields",
    basePrice: "Base price",
    stock: "Stock",
    category: "Category",
    notMappedYet: "Not mapped yet",
    attributes: "Attributes",
    noAttributes: "No enriched attributes yet.",
    variants: "Variants",
    noVariants: "No variants configured.",
    units: "units"
  },
  publishCard: {
    title: "Publish center",
    connected: (count: number) => `${count} connected`,
    description: "Queue an async publish job and let OmniList evaluate each selected channel separately.",
    missingApi: "Run the API before starting publish jobs.",
    selectChannel: "Select at least one connected channel.",
    enqueueFailed: "Could not enqueue publish job.",
    publishToSelected: "Publish to selected channels"
  },
  billingPage: {
    eyebrow: "Monetization",
    title: "Choose the plan that matches your selling volume.",
    description: "Free is perfect for setup and validation. Pro unlocks unlimited products and future AI tooling for serious multichannel sellers.",
    currentUsage: "Current usage",
    productUsage: (count: number, limit: number | null) => (limit === null ? `${count} products used` : `${count} of ${limit} products used`),
    aiIncluded: "AI included",
    aiNotIncluded: "AI not included",
    activePlan: "Active plan",
    switchToFree: "Switch to Free",
    switchToPro: "Activate Pro",
    processing: "Updating plan...",
    updated: "Plan updated successfully."
  }
} as const;
