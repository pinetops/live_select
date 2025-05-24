function debounce(func, msec) {
    let timer;
    return (...args) => {
        clearTimeout(timer)
        timer = setTimeout(() => {
            func.apply(this, args)
        }, msec)
    }
}

export default {
    LiveSelect: {
        textInput() {
            return this.el.querySelector("input[type=text]")
        },
        debounceMsec() {
            return parseInt(this.el.dataset["debounce"])
        },
        updateMinLen() {
            return parseInt(this.el.dataset["updateMinLen"])
        },
        maybeStyleClearButton() {
            const clear_button = this.el.querySelector('button[phx-click=clear]')
            if (clear_button) {
                this.textInput().parentElement.style.position = 'relative'
                clear_button.style.position = 'absolute'
                clear_button.style.top = '0px'
                clear_button.style.bottom = '0px'
                clear_button.style.right = '5px'
                clear_button.style.display = 'block'
            }
        },
        pushEventToParent(event, payload) {
            const target = this.el.dataset['phxTarget'];
            if (target) {
                this.pushEventTo(target, event, payload)
            } else {
                this.pushEvent(event, payload)
            }
        },
        attachDomEventHandlers() {
            this.textInput().onkeydown = (event) => {
                if (this.keyboardMode === "server") {
                    if (event.code === "Enter") {
                        event.preventDefault()
                    }
                    this.pushEventTo(this.el, 'keydown', {key: event.code})
                } else if (this.keyboardMode === "hook") {
                    // Handle keyboard navigation client-side
                    if (event.key === "ArrowDown") {
                        this.moveFocus(1, event)
                    } else if (event.key === "ArrowUp") {
                        this.moveFocus(-1, event)
                    } else if (event.key === "Enter") {
                        this.selectFocused(event)
                    } else if (event.key === "Escape") {
                        this.handleEscape(event)
                    }
                }
            }
            this.changeEvents = debounce((id, field, text) => {
                this.pushEventTo(this.el, "change", {text})
                this.pushEventToParent("live_select_change", {id: this.el.id, field, text})
            }, this.debounceMsec())
            this.textInput().oninput = (event) => {
                const text = event.target.value.trim()
                const field = this.el.dataset['field']
                if (text.length >= this.updateMinLen()) {
                    this.changeEvents(this.el.id, field, text)
                } else {
                    this.pushEventTo(this.el, "options_clear", {})
                }
            }
            const dropdown = this.el.querySelector("ul")
            if (dropdown) {
                dropdown.onmousedown = (event) => {
                    const option = event.target.closest('div[data-idx]')
                    if (option) {
                        this.pushEventTo(this.el, 'option_click', {idx: option.dataset.idx})
                        event.preventDefault()
                    }
                }
            }
            this.el.querySelectorAll("button[data-idx]").forEach(button => {
                button.onclick = (event) => {
                    this.pushEventTo(this.el, 'option_remove', {idx: button.dataset.idx})
                }
            })
        },
        dropdown() {
            return this.el.querySelector("ul")
        },
        getActiveOptionClasses() {
            const classesString = this.el.dataset.activeOptionClasses || ""
            return classesString.split(" ").filter(cls => cls.trim() !== "")
        },
        moveFocus(delta, evt) {
            evt.preventDefault()
            evt.stopPropagation()
            const dropdown = this.dropdown()
            if (!dropdown) return
            
            const opts = dropdown.querySelectorAll("div[data-idx]")
            if (!opts.length) return
            
            // Get all selectable options (those with data-idx)
            const selectableOptions = Array.from(opts)
            if (selectableOptions.length === 0) return
            
            // Get active option classes from server
            const activeOptionClasses = this.getActiveOptionClasses()
            
            // Find currently active option by looking for active classes
            let currentIdx = -1
            selectableOptions.forEach((opt, index) => {
                const hasActiveClass = activeOptionClasses.some(cls => opt.classList.contains(cls))
                if (hasActiveClass) {
                    currentIdx = index
                }
            })
            
            // Calculate new index
            let newIdx
            if (delta > 0) {
                // Moving down
                newIdx = currentIdx < selectableOptions.length - 1 ? currentIdx + 1 : 0
            } else {
                // Moving up
                newIdx = currentIdx > 0 ? currentIdx - 1 : selectableOptions.length - 1
            }
            
            // Remove active classes from all options
            selectableOptions.forEach(opt => {
                activeOptionClasses.forEach(cls => opt.classList.remove(cls))
            })
            
            // Add active classes to the new option
            const newOption = selectableOptions[newIdx]
            if (newOption) {
                activeOptionClasses.forEach(cls => newOption.classList.add(cls))
                newOption.scrollIntoView({block: "nearest"})
                
                // Store the active index for selection
                this.activeIdx = parseInt(newOption.dataset.idx)
            }
        },
        selectFocused(evt) {
            evt.preventDefault()
            evt.stopPropagation()
            
            if (this.activeIdx !== undefined) {
                this.pushEventTo(this.el, 'option_click', {idx: String(this.activeIdx)})
            }
        },
        handleEscape(evt) {
            evt.preventDefault()
            evt.stopPropagation()
            this.pushEventTo(this.el, 'keydown', {key: "Escape"})
        },
        setInputValue(value) {
            this.textInput().value = value
        },
        inputEvent(selection, mode) {
            const selector = mode === "single" ? "input.single-mode" : (selection.length === 0 ? "input[data-live-select-empty]" : "input[type=hidden]")
            this.el.querySelector(selector).dispatchEvent(new Event('input', {bubbles: true}))
        },
        mounted() {
            this.keyboardMode = this.el.dataset.keyboard || "server";
            this.maybeStyleClearButton()
            this.handleEvent("parent_event", ({id, event, payload}) => {
                if (this.el.id === id) {
                    this.pushEventToParent(event, payload)
                }
            })
            this.handleEvent("select", ({id, selection, mode, current_text, input_event, parent_event}) => {
                if (this.el.id === id) {
                    this.selection = selection
                    if (mode === "single") {
                        const label = selection.length > 0 ? selection[0].label : current_text
                        this.setInputValue(label)
                    } else {
                        this.setInputValue(current_text)
                    }
                    if (input_event) {
                        this.inputEvent(selection, mode)
                    }
                    if (parent_event) {
                        this.pushEventToParent(parent_event, {id})
                    }
                }
            })
            this.handleEvent("active", ({id, idx}) => {
                if (this.el.id === id) {
                    const option = this.el.querySelector(`div[data-idx="${idx}"]`)
                    if (option) {
                        option.scrollIntoView({block: "nearest"})
                    }
                }
            })
            this.attachDomEventHandlers()
        },
        updated() {
            // Re-read keyboard mode in case it changed
            this.keyboardMode = this.el.dataset.keyboard || "server";
            this.maybeStyleClearButton()
            this.attachDomEventHandlers()
        },
        reconnected() {
            if (this.selection && this.selection.length > 0) {
                this.pushEventTo(this.el.id, "selection_recovery", this.selection)
            }
        }
    }
}
