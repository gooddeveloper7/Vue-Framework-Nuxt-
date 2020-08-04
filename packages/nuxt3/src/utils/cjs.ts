import { join } from 'path'

export function isExternalDependency (id: string) {
  return /[/\\]node_modules[/\\]/.test(id)
}

export function clearRequireCache (id: string) {
  if (isExternalDependency(id)) {
    return
  }

  const entry = getRequireCacheItem(id)

  if (!entry) {
    delete require.cache[id]
    return
  }

  if (entry.parent) {
    entry.parent.children = entry.parent.children.filter(e => e.id !== id)
  }

  for (const child of entry.children) {
    clearRequireCache(child.id)
  }

  delete require.cache[id]
}

export function scanRequireTree (id: string, files = new Set<string>()) {
  if (isExternalDependency(id) || files.has(id)) {
    return files
  }

  const entry = getRequireCacheItem(id)

  if (!entry) {
    files.add(id)
    return files
  }

  files.add(entry.id)

  for (const child of entry.children) {
    scanRequireTree(child.id, files)
  }

  return files
}

export function getRequireCacheItem (id: string) {
  try {
    return require.cache[id]
  } catch (e) {
  }
}

export function tryRequire (id: string) {
  try {
    return require(id)
  } catch (e) {
  }
}

export function getPKG (id: string) {
  return tryRequire(join(id, 'package.json'))
}
