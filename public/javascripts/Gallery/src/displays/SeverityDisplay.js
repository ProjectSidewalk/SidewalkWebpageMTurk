
/**
 * An object that creates a display for the severity.
 * 
 * @param {HTMLElement} container The DOM element that contains the display
 * @param {Number} severity The severity to display
 * @param {Boolean} isModal a toggle to determine if this SeverityDisplay is in a modal, or in a card
 * @returns {SeverityDisplay} the generated object
 */
function SeverityDisplay(container, severity, isModal=false) {
    let self = this;
    self.severity = severity;
    self.severityContainer = container;

    let circles = [];
    function _init() {
        // Set the different classes and ids depending on whether the severity display is in a Modal or in a card.
        let severityCircleClass = isModal ? 'modal-severity-circle' : 'severity-circle';
        let selectedCircleID = isModal ? 'modal-current-severity' : 'current-severity';

        let holder = document.createElement('div');
        holder.className = 'label-severity-content';

        let title = document.createElement('div');
        title.innerHTML = `<b>${i18next.t("severity")}</b>`;
        container.append(title);

        // Creates all of the circles for the severities.
        for (let i = 1; i <= 5; i++) {
            let severityCircle = document.createElement('div');
            severityCircle.className = severityCircleClass;
            severityCircle.innerText = i;
            circles.push(severityCircle);
        }
        // Highlight the correct severity.
        if (severity) {
            $(circles[severity - 1]).attr('id', selectedCircleID);
        }
        // Add all of the severity circles to the DOM.
        for (let i = 0; i < circles.length; i++) {
            holder.appendChild(circles[i]);
        }
        container.append(holder);
    }

    _init()
    return self;
}