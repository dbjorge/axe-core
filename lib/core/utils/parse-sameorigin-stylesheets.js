/**
 * Parse non cross-origin stylesheets
 *
 * @param {Object} sheet CSSStylesheet object
 * @param {Object} options options object from `axe.utils.parseStylesheets`
 * @param {Array<Number>} priority sheet priority
 * @param {Array<String>} importedUrls urls of already imported stylesheets
 * @param {Boolean} isCrossOrigin boolean denoting if a stylesheet is `cross-origin`
 * @returns {Promise}
 */
axe.utils.parseSameOriginStylesheets = function parseSameOriginStylesheets(
	sheet,
	options,
	priority,
	importedUrls,
	isCrossOrigin = false
) {
	const rules = Array.from(sheet.cssRules);

	if (!rules) {
		return Promise.resolve();
	}

	/**
	 * reference -> https://developer.mozilla.org/en-US/docs/Web/API/CSSRule#Type_constants
	 */
	const cssImportRules = rules.filter(r => r.type === 3); // type === 3 -> CSSRule.IMPORT_RULE

	/**
	 * when no `@import` rules in given sheet -> resolve the current `sheet` & exit
	 */
	if (!cssImportRules.length) {
		// exit
		return Promise.resolve({
			isCrossOrigin,
			priority,
			root: options.rootNode,
			shadowId: options.shadowId,
			sheet
		});
	}

	/**
	 * filter rules that are not already fetched
	 */
	const cssImportUrlsNotAlreadyImported = cssImportRules
		// ensure rule has a href
		.filter(rule => rule.href)
		// extract href from object
		.map(rule => rule.href)
		// only href that are not already imported
		.filter(url => !importedUrls.includes(url));

	/**
	 * iterate `@import` rules and fetch styles
	 */
	const promises = cssImportUrlsNotAlreadyImported.map(
		(importUrl, cssRuleIndex) => {
			const newPriority = [...priority, cssRuleIndex];
			const axiosOptions = {
				method: 'get',
				url: importUrl,
				timeout: options.timeout
			};
			const isCrossOriginRequest = /^https?:\/\/|^\/\//i.test(importUrl);

			importedUrls.push(importUrl);
			return axe.imports.axios(axiosOptions).then(({ data }) => {
				const result = options.convertDataToStylesheet({
					data,
					isCrossOrigin: isCrossOriginRequest,
					priority: newPriority,
					root: options.rootNode,
					shadowId: options.shadowId
				});

				/**
				 * Note:
				 * Safety check to stop recursion, if there are numerous nested `@import` statements
				 */
				if (importedUrls.length > axe.constants.preload.maxImportUrls) {
					return result;
				}

				/**
				 * Parse resolved `@import` stylesheet further for any `@import` styles
				 */
				return axe.utils.parseStylesheet(
					result.sheet,
					options,
					newPriority,
					importedUrls
				);
			});
		}
	);

	const nonImportCSSRules = rules.filter(r => r.type !== 3);

	// no further rules to process in this sheet
	if (!nonImportCSSRules.length) {
		return Promise.all(promises);
	}

	// convert all `nonImportCSSRules` style rules into `text` and chain

	promises.push(
		Promise.resolve(
			options.convertDataToStylesheet({
				data: nonImportCSSRules.map(rule => rule.cssText).join(),
				isCrossOrigin,
				priority,
				root: options.rootNode,
				shadowId: options.shadowId
			})
		)
	);

	return Promise.all(promises);
};