/**
 * Embedded CatSpark mock backend. Import via `@catoffice/catspark/mock` —
 * kept off the root export so renderer bundles never pull in node:http.
 */

export { startMockCloud, type MockCloudHandle } from './server'
export {
  MOCK_ACCOUNT,
  mockAnalyzedText,
  mockGeneratedImageUrl,
  mockImageSearch,
  mockPastProjects,
  mockWebSearch,
  type MockImageResult,
  type MockPastProject,
  type MockWebResult,
} from './data'
