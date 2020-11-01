import { has, isNull, isObject } from 'lodash/fp'
// import { v1 as uuid } from 'uuid'
const { createRemoteFileNode } = require(`gatsby-source-filesystem`)

const extractFields = async (apiURL, store, cache, createNode, touchNode, auth, item) => {
  if (!isNull(item) && has('mime', item)) {
    let fileNodeID
    // using field on the cache key for multiple image field
    const mediaDataCacheKey = `strapi-media-${item.id || item.hash}`
    const cacheMediaData = await cache.get(mediaDataCacheKey)

    // If we have cached media data and it wasn't modified, reuse
    // previously created file node to not try to redownload
    if (cacheMediaData && item.name === cacheMediaData.name) {
      fileNodeID = cacheMediaData.fileNodeID
      touchNode({ nodeId: cacheMediaData.fileNodeID })
    }

    if (fileNodeID) {
      item[`localImage`] = fileNodeID
      item[`localImage___NODE`] = fileNodeID
    }

    if (!fileNodeID) {
      try {
        // full media url
        const source_url = `${item.url.startsWith('http') ? '' : apiURL}${item.url}`
        const fileNode = await createRemoteFileNode({
          url: source_url,
          store,
          cache,
          createNode,
          auth,
        })

        // If we don't have cached data, download the file
        if (fileNode) {
          await cache.set(mediaDataCacheKey, {
            fileNodeID: fileNode.id,
            updated_at: item.updated_at,
            name: item.name,
          })

          item[`localImage`] = fileNode.id
          item[`localImage___NODE`] = fileNode.id
        }
      } catch (e) {
        // Ignore
      }
      console.log(item)
    }
  }

  for (const key of Object.keys(item)) {
    const field = item[key]
    if (Array.isArray(field)) {
      // add recursion to fetch nested strapi references
      await Promise.all(field.map(async f => extractFields(apiURL, store, cache, createNode, touchNode, auth, f)))
    } else {
      // image fields have a mime property among other
      // maybe should find a better test
      if (!isNull(field) && has('mime', field)) {
        let fileNodeID
        // using field on the cache key for multiple image field
        const mediaDataCacheKey = `strapi-media-${item.id || item.hash}-${key}`
        const cacheMediaData = await cache.get(mediaDataCacheKey)

        // If we have cached media data and it wasn't modified, reuse
        // previously created file node to not try to redownload
        if (cacheMediaData && field.name === cacheMediaData.name) {
          fileNodeID = cacheMediaData.fileNodeID
          touchNode({ nodeId: cacheMediaData.fileNodeID })
        }

        if (fileNodeID) {
          item[`${key}___NODE`] = fileNodeID
        }

        // If we don't have cached data, download the file
        if (!fileNodeID) {
          try {
            // full media url
            const source_url = `${field.url.startsWith('http') ? '' : apiURL}${field.url}`
            const fileNode = await createRemoteFileNode({
              url: source_url,
              store,
              cache,
              createNode,
              auth,
            })

            // If we don't have cached data, download the file
            if (fileNode) {
              await cache.set(mediaDataCacheKey, {
                fileNodeID: fileNode.id,
                updated_at: field.updated_at,
                name: field.name,
              })

              item[`${key}___NODE`] = fileNode.id
            }
          } catch (e) {
            // Ignore
          }
        }
      } else if (!isNull(field) && isObject(field)) {
        await extractFields(apiURL, store, cache, createNode, touchNode, auth, field)
      }
    }
  }
}

// Downloads media from image type fields
exports.downloadMediaFiles = async ({ entities, apiURL, store, cache, createNode, touchNode, jwtToken: auth }) =>
  Promise.all(
    entities.map(async entity => {
      for (let item of entity) {
        // loop item over fields
        await extractFields(apiURL, store, cache, createNode, touchNode, auth, item)
      }
      return entity
    })
  )
