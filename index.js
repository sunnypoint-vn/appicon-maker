/* @flow */

// Read user's input
const readline = require('readline')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

// File Srream
const FS = require('fs-extra')
const Path = require('path')
const ThrowError = require('throw-error')

// Mime type
const MIME = require('mime')

// Image Processing Lib
const Jimp = require('jimp')

const chalk = require('chalk')

/* eslint-disable */
// Add writeSync for Jimp
Jimp.prototype.writeSync = function (path, callback) {
    if (typeof path !== 'string') return ThrowError.call(this, 'path must be a string', callback)
    if (typeof callback === 'undefined') callback = function () {}
    if (typeof callback !== 'function') return ThrowError.call(this, 'callback must be a function', callback)

    const that = this
    const mime = MIME.getType(path)

    this.getBuffer(mime, function (err, buffer) {
        if (err) return ThrowError.call(that, err, callback)
        FS.writeFileSync(path, buffer)
        // $FlowFixMe
        callback.call(that, null, that)
        return this
    })
}
/* eslint-disable */

const dimens = require('./assets/dimens')
const contents = require('./assets/ios_content_assets')

const platformTypes = ['Android', 'iOS']
const variantTypes = ['Alpha', 'Beta', 'Production']

let outputDirPath // Final Output Directory

function createAndroidAppIcon(path, variant, mask, callback) {
    const dpis = Array.from(dimens.android)
    const makeIcon = (items) => {
        if (items && items.length > 0) {
            const { name, dimen } = items[0]
            const iconPath = `${path}/mipmap-${name}`
            FS.mkdirSync(iconPath)
            const clone = variant.clone().mask(mask)
            clone.resize(dimen, Jimp.AUTO).writeSync(`${iconPath}/ic_launcher.png`, () => {
                items.splice(0, 1)
                makeIcon(items)
            })
        } else {
            const clone = variant.clone()
            clone.resize(512, Jimp.AUTO).writeSync(`${path}/playstore-icon.png`, callback)
        }
    }

    makeIcon(dpis)
}

function createiOSAppIcon(path, variant, callback) {
    const sizes = Array.from(dimens.iOS)
    const makeIcon = (items) => {
        if (items && items.length > 0) {
            const { name, dimen } = items[0]
            const clone = variant.clone()
            clone.resize(dimen, Jimp.AUTO).writeSync(`${path}/${name}.png`, () => {
                items.splice(0, 1)
                makeIcon(items)
            })
        } else {
            FS.writeFileSync(`${path}/Contents.json`, JSON.stringify(contents))
            callback()
        }
    }

    makeIcon(sizes)
}

function exit(error) {
    error ? console.log(`🙏 ${chalk.red(error)}`) : console.log(chalk.green('🎉 Tadaaaa!!! Checking output folder, please!'))
    process.exit()
}

function checkResources(images) {
    if (FS.existsSync(outputDirPath)) {
        FS.removeSync(outputDirPath)
    }
    FS.mkdirSync(outputDirPath)

    if (images[0]) {
        const { bitmap: { width, height }} = images[0]
        if (width !== height) {
            exit('Width and Height of image should be same size')
        }
        if (width < 1024) {
            exit('Image\'s Size should be greater than 1024')
        }
        if (images[0].hasAlpha()) {
            exit('Image should not contain Alpha channel')
        }
        if (width > 1024) {
            images[0] = images[0].resize(1024, Jimp.AUTO)
        }

        createAssetsFolder(images)
    } else {
        exit('Cannot read data from image')
    }
}

function createAssetsFolder(images) {
    const createPlatformFolder = (platforms) => {
        if (platforms && platforms.length > 0) {
            const platform = platforms[0]
            console.log(chalk.blue('🚀 Creating AppIcon for: '), chalk.bgGreen(platform))
            const platformDirPath = `${outputDirPath}/${platform}`
            FS.mkdirSync(platformDirPath)

            const createVariantFolder = (variants) => {
                if (variants && variants.length > 0) {
                    const variant = variants[0]

                    const variantClone = images[0].clone() // Clone Source
                    let suffix = `_${variant}`
                    if (variant === 'Production') {
                        suffix = ''
                    } else if (variant === 'Alpha') {
                        variantClone.blit(images[2], 368, 798)
                    } else {
                        variantClone.blit(images[3], 368, 798)
                    }
                    
                    const variantDirPath = `${platformDirPath}/${platform}_App_Icon${suffix}`

                    FS.mkdirSync(variantDirPath)
                    if (platform === 'iOS') {
                        const appIconSuffix = variant === 'Production' ? '' : variant
                        const assetDirPath = `${variantDirPath}/AppIcon${appIconSuffix}.appiconset`
                        FS.mkdirSync(assetDirPath)
                        createiOSAppIcon(assetDirPath, variantClone, () => {
                            variants.splice(0, 1)
                            createVariantFolder(variants)
                        })
                    } else if (platform === 'Android') {
                        createAndroidAppIcon(variantDirPath, variantClone, images[1], () => {
                            variants.splice(0, 1)
                            createVariantFolder(variants)
                        })
                    }
                } else {
                    platforms.splice(0, 1)
                    createPlatformFolder(platforms)
                }
            }

            createVariantFolder(Array.from(variantTypes))
        } else {
            exit()
        }
    }

    createPlatformFolder(platformTypes)
}

function main() {
    rl.question('Drop your image here: ', (path) => {
        const trim = path.trimEnd().replace(/\\/g, '')
        if (!trim || !FS.pathExistsSync(trim)) {
            console.log('Invalid path')
            process.exit()
        } else {
            // Define Output Directory as same Input Path
            outputDirPath = `${Path.dirname(trim)}/ouput`
        }

        const readSource = Jimp.read(trim)
        const readMask = Jimp.read(`${__dirname}/assets/raw/mask.png`)
        const readAlphaTag = Jimp.read(`${__dirname}/assets/raw/alpha.png`)
        const readBetaTag = Jimp.read(`${__dirname}/assets/raw/beta.png`)

        Promise.all([readSource, readMask, readAlphaTag, readBetaTag]).then((images) => {
            // images: [ 0: Source, 1: Mask, 2: AlphaTag, 3: BetaTag]
            checkResources(images)
        }).catch(e => {
            exit(e.message)
        })
    })
}

main()
