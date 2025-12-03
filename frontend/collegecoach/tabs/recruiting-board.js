document.addEventListener('DOMContentLoaded', async function() {
    // Show/hide recruiting-specific nav items for college coaches only
    await setupCollegeCoachNav();

    // Toggle between offense and defense
    const offenseBtn = document.getElementById('offenseBtn');
    const defenseBtn = document.getElementById('defenseBtn');
    const offenseField = document.getElementById('offenseField');
    const defenseField = document.getElementById('defenseField');

    offenseBtn.addEventListener('click', () => {
    offenseBtn.classList.add('active');
    defenseBtn.classList.remove('active');
    offenseField.classList.remove('hidden');
    defenseField.classList.add('hidden');
});

    defenseBtn.addEventListener('click', () => {
        defenseBtn.classList.add('active');
        offenseBtn.classList.remove('active');
        defenseField.classList.remove('hidden');
        offenseField.classList.add('hidden');
    });

    // Drag and drop functionality
    let draggedElement = null;
    let sourceContainer = null;

    // Get all recruit cards
    const recruitCards = document.querySelectorAll('.recruit-card');
    const recruitsLists = document.querySelectorAll('.recruits-list');

    // Add drag event listeners to all recruit cards
    recruitCards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
    });

    // Add drop zone event listeners to all recruit lists
    recruitsLists.forEach(list => {
        list.addEventListener('dragover', handleDragOver);
        list.addEventListener('drop', handleDrop);
        list.addEventListener('dragenter', handleDragEnter);
        list.addEventListener('dragleave', handleDragLeave);
    });

    function handleDragStart(e) {
        draggedElement = this;
        sourceContainer = this.parentElement;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');

        // Remove drag-over class from all lists
        recruitsLists.forEach(list => {
            list.classList.remove('drag-over');
        });

        draggedElement = null;
        sourceContainer = null;
    }

    function handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDragEnter(e) {
        // Only highlight if dragging within the same position
        if (draggedElement && this === sourceContainer) {
            this.classList.add('drag-over');
        }
    }

    function handleDragLeave(e) {
        if (e.target === this) {
            this.classList.remove('drag-over');
        }
    }

    function handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        this.classList.remove('drag-over');

        // Only allow drops within the same position
        if (draggedElement && this === sourceContainer) {
            const afterElement = getDragAfterElement(this, e.clientY);

            if (afterElement == null) {
                this.appendChild(draggedElement);
            } else {
                this.insertBefore(draggedElement, afterElement);
            }

            // Update rankings after reorder
            updateRankings(this);
        }

        return false;
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.recruit-card:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function updateRankings(container) {
        const recruitCards = container.querySelectorAll('.recruit-card');
        recruitCards.forEach((card, index) => {
            const rankElement = card.querySelector('.recruit-rank');
            if (rankElement) {
                rankElement.textContent = index + 1;
            }
        });
    }

    // Initialize rankings on page load
    recruitsLists.forEach(list => {
        updateRankings(list);
    });
});
