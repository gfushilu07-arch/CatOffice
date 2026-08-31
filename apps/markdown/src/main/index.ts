import { startMockCloud } from '@catoffice/catspark/mock'
import { startMarkdownStandalone } from './markdown-main'

// embedded CatSpark mock backend: no-op unless mock mode is on (the default
// until CATSPARK_API_BASE points at a real deployment)
void startMockCloud()

startMarkdownStandalone()
