'use strict'

/**
 * Dependencies
 */
const through = require('through2')
const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')
const PluginError = require('plugin-error')

const PLUGIN_NAME = 'gulp-sass-inline-svg'
const URI_PREFIX = 'data:image/svg+xml, '

module.exports = gulpSassInlineSvg

/**
 * Convert svg file into a sass function and write to a scss file
 * @param {object} options plugin options
 */
function gulpSassInlineSvg (options) {
  options = options || {}
  options.destDir = options.destDir || './scss'

  // Create the output directory if it does not exist
  if (!fs.existsSync(options.destDir)) {
    fs.mkdirSync(options.destDir)
  }

  options.rootScss = path.join(options.destDir, '_sass-inline-svg.scss')
  options.dataScss = path.join(options.destDir, '_sass-inline-svg-data.scss')

  const writeStreamRoot = fs.createWriteStream(options.rootScss)
  writeStreamRoot.write(fs.readFileSync(path.join(__dirname, '/_sass-inline-svg.scss'), 'utf8'))
  writeStreamRoot.end()

  const writeStream = fs.createWriteStream(options.dataScss)

  let svgMap = '$svg-map: ('

  function listStream (file, enc, cb) {
    const dir = path.parse(file.path).dir.split(path.sep)
    const folderName = dir.pop()
    const fileName = path.parse(file.path).name
    svgMap += "'" + fileName + "': ('name': '" + fileName + "', 'folder': '" + folderName + "'),"

    svgToInlineSvg(writeStream, cb, file.path, String(file.contents))
  }

  function endStream (cb) {
    svgMap += ');\n'
    writeStream.write(svgMap)
    writeStream.end()
    cb()
  }
  return through.obj(listStream, endStream)
}

/**
 * Convert svg string to inline svg with sass variables
 * @param {*} writeStream
 * @param {*} cb
 * @param {*} filePath
 * @param {*} svgString
 */
function svgToInlineSvg (writeStream, cb, filePath, svgString) {
  const inlineSvg = encodeSVG(addVariables(filePath, svgString))
  const fileName = path.parse(filePath).name

  writeStream.write(
    assembleDataString(fileName, inlineSvg)
  )
  cb()
}

/**
 * Enocde the svg string as a URI based on recommended optimization of data uri
 * strings for full cross browser support
 * @see https://codepen.io/tigt/post/optimizing-svgs-in-data-uris
 * @param {string} svgString the html string of the inline svg
 * @returns {string} the svg as a encoded uri string
 */
function encodeSVG (svgString) {
  let uriPayload = svgString.replace(/\n+/g, '') // remove newlines
  uriPayload = encodeURIComponent(uriPayload) // encode URL-unsafe characters

  uriPayload = uriPayload
    .replace(/%20/g, ' ') // put spaces back in
    .replace(/%3D/g, '=') // ditto equals signs
    .replace(/%3A/g, ':') // ditto colons
    .replace(/%2F/g, '/') // ditto slashes
    .replace(/%22/g, "'") // replace quotes with apostrophes (may break certain SVGs)

  // Decode sass variables
  const regex = /(%23%7B).*?(%7D)/gm // (#{if).*?(})/gm; in URI
  uriPayload = uriPayload.replace(regex, function (str) {
    return decodeURIComponent(str)
  })

  return uriPayload
}

/**
 * Swaps fill and stroke attributes with a value of black of an svg file to sass
 * variables so that we can change the color with sass.
 * @param {String} filePath The file path
 * @param {String} fileContent HTML/XML string
 */
function addVariables (filePath, fileContent) {
  const $ = cheerio.load(fileContent, {
    normalizeWhitespace: true,
    xmlMode: true
  })

  if ($('svg').length !== 1) {
    throw new PluginError(PLUGIN_NAME, "File at '" + filePath + "' is not a valid svg file")
  }

  // Allow fill values that are black to be set with sass variable.
  const $fills = $('[fill]').not('[fill=none]')
  if ($fills.length > 0) {
    const $fillsToChange = $('[fill="#000"], [fill="#000000"], [fill="rgb(0,0,0)"]')
    $fillsToChange.attr('fill', '#{$fillcolor}')
  } else {
    $('svg').attr('fill', '#{$fillcolor}')
  }

  // Allow stroke values that are black to be set with a sass variable
  const $strokes = $('[stroke="#000"], [stroke="#000000"], [stroke="rgb(0,0,0)"]')
  $strokes.attr('stroke', '#{$strokecolor}')

  return $.html('svg') // return only the svg
}

/**
 * Create a sass function that will return the URI for the inline svg
 * @param {string} fileName The name of the svg file
 * @param {string} inlineSvg The encoded svg string
 * @returns (string) The sass function as a string
 */
function assembleDataString (fileName, inlineSvg) {
  return '@function ' + fileName + '( $fillcolor, $strokecolor) { @return "' + URI_PREFIX + inlineSvg + '"; }\n\n'
}
