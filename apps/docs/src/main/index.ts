import { startMockCloud } from '@catoffice/catspark/mock'
import { startDocsStandalone } from './docs-main'

// embedded CatSpark mock backend: no-op unless mock mode is on (the default
// until CATSPARK_API_BASE points at a real deployment)
void startMockCloud()

startDocsStandalone()
