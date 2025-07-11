// Manages the filter system logic and UI generation

const ANY_FILTER_VALUE = "__ANY__";

class FilterSystem {
    constructor(allRecordsData, filterConfig) {
        this.allRecordsData = allRecordsData;
        this.filterConfig = filterConfig;
        this.activeFilters = []; // Array of { categoryId: string, value: any }
        this.uniqueFilterValues = this.extractUniqueValues();
    }

    extractUniqueValues() {
        // Return arrays of unique category values sorted by frequency and recency
        const allValues = {}; // Changed back to allValues

        this.allRecordsData.sort((a, b) => new Date(b.date) - new Date(a.date));
        this.filterConfig.forEach((cat) => {
            const categoryId = cat.id;
            let catValuesArray = [
                ...new Set(this.allRecordsData.map((r) => r[categoryId])),
            ].filter((r) => r);
            allValues[categoryId] = catValuesArray;
        });

        return allValues;
    }

    addFilter(categoryId, value) {
        // Prevent duplicate filters
        if (
            !this.activeFilters.some(
                (f) => f.categoryId === categoryId && f.value === value
            )
        ) {
            this.activeFilters.push({ categoryId, value });
        }
    }

    removeFilter(categoryId, value) {
        this.activeFilters = this.activeFilters.filter(
            (f) => !(f.categoryId === categoryId && f.value === value)
        );
    }

    clearAllFilters() {
        this.activeFilters = [];
    }

    /**
     * Applies current filters to all .date-cell elements on the page.
     */
    applyFilters() {
        const dateCells = document.querySelectorAll(".date-cell");

        dateCells.forEach((cell) => {
            const cellRecords = JSON.parse(cell.dataset.records);

            if (this.activeFilters.length === 0) {
                cell.classList.remove("filtered");
                return;
            }

            const cellHasPassingRecord = cellRecords.some((record) =>
                this.recordPassesAllActiveFilters(record)
            );
            cell.classList.toggle("filtered", !cellHasPassingRecord);
        });
    }

    recordPassesAllActiveFilters(record) {
        // Group active filters by categoryId
        const groupedFilters = this.activeFilters.reduce((acc, f) => {
            if (!acc[f.categoryId]) {
                acc[f.categoryId] = [];
            }
            acc[f.categoryId].push(f.value);
            return acc;
        }, {});

        // Check if the record passes all active filter categories
        for (const categoryId in groupedFilters) {
            if (
                !this.recordPassesCategoryFilters(
                    record,
                    categoryId,
                    groupedFilters[categoryId]
                )
            ) {
                return false; // Fails if it doesn't pass any one of the active categories
            }
        }
        return true; // Passes all category checks
    }

    recordPassesCategoryFilters(record, categoryId, activeValuesForCategory) {
        const recordValue = record[categoryId];

        return activeValuesForCategory.some((filterValue) => {
            if (filterValue === ANY_FILTER_VALUE) {
                return !!recordValue; // Truthy check for recordValue
            }
            return recordValue === filterValue;
        });
    }

    /**
     * Calculates the counts for all filter options.
     * For each category, counts are based on items that pass
     * all *other* active filters (i.e., filters from other categories).
     */
    getFilterCounts() {
        const allCategoryCounts = {};

        // Pre-group all active filters by category (do this once)
        const groupedActiveFilters = this.activeFilters.reduce((acc, f) => {
            if (!acc[f.categoryId]) {
                acc[f.categoryId] = [];
            }
            acc[f.categoryId].push(f.value);
            return acc;
        }, {});

        this.filterConfig.forEach((categoryConfig) => {
            const currentCategoryId = categoryConfig.id;
            const countsForThisCategory = {};
            let anyCount = 0;

            // Get the active filters for all OTHER categories
            const otherCategoryFilters = { ...groupedActiveFilters };
            delete otherCategoryFilters[currentCategoryId];

            this.allRecordsData.forEach((record) => {
                let passesOtherFilters = true;

                // Check if record passes filters from other categories
                for (const otherCatId in otherCategoryFilters) {
                    if (
                        !this.recordPassesCategoryFilters(
                            record,
                            otherCatId,
                            otherCategoryFilters[otherCatId]
                        )
                    ) {
                        passesOtherFilters = false;
                        break;
                    }
                }

                if (passesOtherFilters) {
                    const recordValue = record[currentCategoryId];
                    if (recordValue) {
                        countsForThisCategory[recordValue] =
                            (countsForThisCategory[recordValue] || 0) + 1;
                        anyCount++; // Simple counter instead of Set
                    }
                }
            });

            // Store the count for the "Any" option if the category includes it
            if (categoryConfig.includeAny) {
                countsForThisCategory[ANY_FILTER_VALUE] = anyCount;
            }

            allCategoryCounts[currentCategoryId] = countsForThisCategory;
        });

        return allCategoryCounts;
    }

    // Populates the filter UI controls in the given container element
    populateFilterControls(containerElementId) {
        const containerElement = document.getElementById(containerElementId);
        if (!containerElement) {
            console.error(
                `FilterSystem: Element with ID '${containerElementId}' not found.`
            );
            return;
        }
        containerElement.innerHTML = ""; // Clear previous controls

        const filterWrapper = document.createElement("div");
        filterWrapper.className = "filter-wrapper";

        // --- Clear All Filters Link ---
        const clearAllContainer = document.createElement("div");
        clearAllContainer.className = "clear-all-container";
        const clearAllLink = document.createElement("a");
        clearAllLink.className = "clear-all-link";
        clearAllLink.href = "#";
        clearAllLink.textContent = "Clear all filters";
        clearAllLink.addEventListener("click", (e) => {
            e.preventDefault();
            this.clearAllFilters();
            const categoryClearLinks = document.querySelectorAll(
                ".category-clear-link"
            );
            categoryClearLinks.forEach((cl) => cl.classList.add("hidden"));
            const allCheckboxes = filterWrapper.querySelectorAll(
                'input[type="checkbox"]'
            );
            allCheckboxes.forEach((cb) => (cb.checked = false));
            this.filterConfig.forEach((catConfig) => {
                const button = filterWrapper.querySelector(
                    `#dropdown-button-${catConfig.id}`
                );
                if (button) {
                    this._updateDropdownButtonText(button, catConfig);
                }
            });
            this.applyFilters();
            this._updateFilterOptionCounts(filterWrapper);
        });
        clearAllContainer.appendChild(clearAllLink);

        // --- Filter Dropdowns ---
        const filterControls = document.createElement("div");
        filterControls.className = "filter-controls";

        this.filterConfig.forEach((categoryConfig) => {
            const filterColumn = this._createFilterDropdown(
                categoryConfig,
                filterWrapper
            );
            filterControls.appendChild(filterColumn);
        });

        filterControls.appendChild(clearAllContainer);
        filterWrapper.appendChild(filterControls);
        containerElement.appendChild(filterWrapper);

        // --- Document click listener for closing dropdowns ---
        if (FilterSystem.clickOutsideListener) {
            document.removeEventListener(
                "click",
                FilterSystem.clickOutsideListener
            );
        }
        FilterSystem.clickOutsideListener = (event) => {
            const openDropdownContents = filterWrapper.querySelectorAll(
                ".dropdown-content.show"
            );
            openDropdownContents.forEach((dropdownContent) => {
                const dropdownContainer = dropdownContent.closest(
                    ".dropdown-container"
                );
                if (
                    dropdownContainer &&
                    !dropdownContainer.contains(event.target)
                ) {
                    dropdownContent.classList.remove("show");
                }
            });
        };
        document.addEventListener("click", FilterSystem.clickOutsideListener);

        this._updateFilterOptionCounts(filterWrapper);
    }

    _createFilterDropdown(categoryConfig, filterWrapper) {
        const column = document.createElement("div");
        column.className = "filter-column";

        const headerContainer = document.createElement("div");
        headerContainer.className = "filter-header";

        const heading = document.createElement("h2");
        heading.textContent = categoryConfig.label;
        headerContainer.appendChild(heading);

        const clearLink = document.createElement("a");
        clearLink.className = "category-clear-link hidden";
        clearLink.textContent = "(clear filters)";

        const dropdownContainer = document.createElement("div");
        dropdownContainer.className = "dropdown-container";

        const dropdownButton = document.createElement("button");
        dropdownButton.className = "dropdown-button";
        dropdownButton.id = `dropdown-button-${categoryConfig.id}`;

        clearLink.addEventListener("click", (e) => {
            e.preventDefault();
            this.activeFilters = this.activeFilters.filter(
                (f) => f.categoryId !== categoryConfig.id
            );
            const dropdownContent =
                dropdownContainer.querySelector(".dropdown-content");
            if (dropdownContent) {
                const checkboxes = dropdownContent.querySelectorAll(
                    'input[type="checkbox"]'
                );
                checkboxes.forEach((cb) => (cb.checked = false));
            }
            this.applyFilters();
            this._updateDropdownButtonText(dropdownButton, categoryConfig);
            this._updateFilterOptionCounts(filterWrapper);
            clearLink.classList.add("hidden"); // Use class to hide
        });

        headerContainer.appendChild(clearLink);
        column.appendChild(headerContainer);

        this._updateDropdownButtonText(dropdownButton, categoryConfig);

        const updateClearLinkVisibility = () => {
            const hasActiveFilters = this.activeFilters.some(
                (f) => f.categoryId === categoryConfig.id
            );
            clearLink.classList.toggle("hidden", !hasActiveFilters);
        };
        updateClearLinkVisibility();

        dropdownButton.addEventListener("click", (e) => {
            e.stopPropagation();
            const currentDropdownContent =
                dropdownContainer.querySelector(".dropdown-content");
            filterWrapper
                .querySelectorAll(".dropdown-content.show")
                .forEach((otherContent) => {
                    if (otherContent !== currentDropdownContent) {
                        otherContent.classList.remove("show");
                    }
                });
            if (currentDropdownContent) {
                currentDropdownContent.classList.toggle("show");
            }
        });
        dropdownContainer.appendChild(dropdownButton);

        const dropdownContent = document.createElement("div");
        dropdownContent.className = "dropdown-content";

        if (categoryConfig.includeAny) {
            const anyOptionDiv = this._createCheckboxOption(
                ANY_FILTER_VALUE,
                `Any ${categoryConfig.label.toLowerCase()}`,
                categoryConfig,
                dropdownButton,
                dropdownContent,
                updateClearLinkVisibility,
                filterWrapper
            );
            dropdownContent.appendChild(anyOptionDiv);
        }

        const values = this.uniqueFilterValues[categoryConfig.id] || [];
        values.forEach((value) => {
            const optionDiv = this._createCheckboxOption(
                value,
                String(value),
                categoryConfig,
                dropdownButton,
                dropdownContent,
                updateClearLinkVisibility,
                filterWrapper
            );
            dropdownContent.appendChild(optionDiv);
        });

        dropdownContainer.appendChild(dropdownContent);
        column.appendChild(dropdownContainer);
        return column;
    }

    _createCheckboxOption(
        value,
        labelText,
        categoryConfig,
        dropdownButton,
        dropdownContentElement,
        updateClearLinkVisibility,
        filterWrapper
    ) {
        const optionDiv = document.createElement("div");
        optionDiv.className = "dropdown-option";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = value;
        checkbox.id = `filter-${categoryConfig.id}-${String(value)
            .replace(/\s+/g, "-")
            .replace(/[^a-zA-Z0-9-]/g, "")}`;
        checkbox.checked = this.activeFilters.some(
            (f) => f.categoryId === categoryConfig.id && f.value === value
        );
        checkbox.className = "filter-checkbox";

        checkbox.dataset.originalLabelText = labelText;

        const label = document.createElement("label");
        label.htmlFor = checkbox.id;
        label.textContent = labelText;

        const handleCheckboxChange = () => {
            const categoryId = categoryConfig.id;
            const isThisAnyCheckbox = value === ANY_FILTER_VALUE;

            if (checkbox.checked) {
                if (isThisAnyCheckbox) {
                    dropdownContentElement
                        .querySelectorAll('input[type="checkbox"]')
                        .forEach((cb) => {
                            if (cb !== checkbox) {
                                cb.checked = false;
                            }
                        });
                    this.activeFilters = this.activeFilters.filter(
                        (f) => f.categoryId !== categoryId
                    );
                    this.addFilter(categoryId, ANY_FILTER_VALUE);
                } else {
                    if (categoryConfig.includeAny) {
                        const anyCheckbox =
                            dropdownContentElement.querySelector(
                                `input[type="checkbox"][value="${ANY_FILTER_VALUE}"]`
                            );
                        if (anyCheckbox && anyCheckbox.checked) {
                            anyCheckbox.checked = false;
                            this.removeFilter(categoryId, ANY_FILTER_VALUE);
                        }
                    }
                    this.addFilter(categoryId, value);
                }
            } else {
                this.removeFilter(categoryId, value);
            }

            this.applyFilters();
            this._updateDropdownButtonText(dropdownButton, categoryConfig);
            this._updateFilterOptionCounts(filterWrapper);
            updateClearLinkVisibility();
        };

        optionDiv.addEventListener("click", (e) => {
            if (e.target !== checkbox && e.target !== label) {
                checkbox.checked = !checkbox.checked;
                handleCheckboxChange();
            }
        });

        checkbox.addEventListener("change", handleCheckboxChange);

        optionDiv.appendChild(checkbox);
        optionDiv.appendChild(label);
        return optionDiv;
    }

    _updateDropdownButtonText(button, categoryConfig) {
        const activeCategoryFilters = this.activeFilters.filter(
            (f) => f.categoryId === categoryConfig.id
        );

        if (activeCategoryFilters.length === 0) {
            button.textContent = "Showing all";
        } else {
            const hasAnyFilter = activeCategoryFilters.some(
                (f) => f.value === ANY_FILTER_VALUE
            );
            const singularLabel = categoryConfig.label.toLowerCase();
            const pluralLabel = singularLabel + "s";

            if (hasAnyFilter) {
                button.textContent = `Showing any ${singularLabel}`;
            } else {
                button.textContent = `Showing ${activeCategoryFilters.length} ${
                    activeCategoryFilters.length === 1
                        ? singularLabel
                        : pluralLabel
                }`;
            }
        }
    }

    _updateFilterOptionCounts(filterWrapperElement) {
        const allCounts = this.getFilterCounts();

        this.filterConfig.forEach((categoryConfig) => {
            const categoryId = categoryConfig.id;
            const countsForThisCategory = allCounts[categoryId] || {};

            const dropdownButton = filterWrapperElement.querySelector(
                `#dropdown-button-${categoryId}`
            );
            const dropdownContentElement = dropdownButton
                ?.closest(".dropdown-container")
                ?.querySelector(".dropdown-content");

            if (!dropdownContentElement) return;

            dropdownContentElement
                .querySelectorAll(".dropdown-option")
                .forEach((optionDiv) => {
                    const checkbox = optionDiv.querySelector(
                        'input[type="checkbox"]'
                    );
                    const label = optionDiv.querySelector("label");
                    if (!checkbox || !label) return;

                    const value = checkbox.value;
                    const count = countsForThisCategory[value] || 0;

                    const originalLabelText =
                        checkbox.dataset.originalLabelText ||
                        (value === ANY_FILTER_VALUE
                            ? `Any ${categoryConfig.label.toLowerCase()}`
                            : String(value));

                    label.textContent = `${originalLabelText} (${count})`;
                    optionDiv.classList.toggle(
                        "disabled",
                        count === 0 && !checkbox.checked
                    );
                });
        });
    }
}

export { FilterSystem };