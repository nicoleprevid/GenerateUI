import SwaggerParser from '@apidevtools/swagger-parser'

export async function loadOpenApi(path: string) {
  return SwaggerParser.dereference(path)
}
