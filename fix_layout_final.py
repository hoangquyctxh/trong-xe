
import os

file_path = r'c:\Users\HP\Downloads\trong-xe-main\style.css'

new_css = """
/* ==========================================================================
   10. FINAL LAYOUT FIX (USER REQUESTED CSS)
   ========================================================================== */
/* Force column layout on ALL screens */
.action-hub-buttons {
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
    width: 100% !important;
    margin-top: 16px !important;
}

/* Ensure buttons take full width */
.action-hub-buttons .action-button {
    width: 100% !important;
    flex: auto !important; /* Reset any flex-grow/shrink */
    margin: 0 !important;
    max-width: none !important; /* Remove max-width constraints if any */
}

/* Specific styling for the 'View Ticket' button to make it distinct but secondary if needed, 
   or just ensure it follows the same sizing */
.action-button[data-action="view-ticket"] {
    margin-top: 0 !important; /* Handled by gap */
}

/* Override any potential desktop media queries that force row direction */
@media (min-width: 768px) {
    .action-hub-buttons {
        flex-direction: column !important; /* KEEP COLUMNS ON DESKTOP */
        align-items: stretch !important;
    }
    
    .action-hub-buttons .action-button {
        width: 100% !important;
    }
}
"""

try:
    with open(file_path, 'a', encoding='utf-8') as f:
        f.write("\n" + new_css)
    print("Successfully appended Layout Fix to style.css")
except Exception as e:
    print(f"Error: {e}")
