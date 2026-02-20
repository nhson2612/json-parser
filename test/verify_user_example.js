const { parseSmart } = require("../src/parser");

const input = `{"responseContext":{"serviceTrackingParams":[{"service":"GFEEDBACK","params":[{"key":"ipcc","value":"0"},{"key":"is_alc_surface","value":"false"},{"key":"is_viewed_live","value":"False"},{"key":"wh_paused","value":"0"},{"key":"logged_in","value":"1"}]},{"service":"CSI","params":[{"key":"yt_ad","value":"1"},{"key":"c","value":"WEB"},{"key":"cver","value":"2.20260218.04.00-canary_control_2.20260220.01.00"},{"key":"yt_li","value":"1"},{"key":"GetPlayer_rid","value":"0x56da0be789af2ac2"}]},{"service":"GUIDED_HELP","params":[{"key":"logged_in","value":"1"}]},","fps":30,"qualityLabel":"240p","projectionType":"RECTANGULAR","averageBitrate":125312,"colorInfo":{"primaries":"COLOR_PRIMARIES_BT709","transferCharacteristics":"COLOR_TRANSFER_CHARACTERISTICS_BT709","matrixCoefficients":"COLOR_MATRIX_COEFFICIENTS_BT709"},"approxDurationMs":"2732333","qualityOrdinal":"QUALITY_ORDINAL_240P"},{"itag":395,"mimeType":"video/mp4; codecs="av01.0.00M.08"","bitrate":207057,"width":426,"height":240,"initRange":{"start":"0","end":"699"},"indexRange":{"start":"700","end":"6767"},"lastModified":"1751179965799407","contentLength":"45963632","qualit`;

const result = parseSmart(input);

console.log("=== Parse Result ===");
console.log("OK:", result.ok);
console.log("Error count:", result.errorCount);
console.log("\n=== FULL PARSED DATA ===");
console.log(JSON.stringify(result.results[0], null, 2));
console.log("\n=== ERRORS (recovery log) ===");
result.errors.forEach((e) => console.log(" •", e));
