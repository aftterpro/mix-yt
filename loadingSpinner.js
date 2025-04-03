// loadingSpinner.js

// Function to hide the loading spinner
function hideLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
        loadingSpinner.classList.add('hidden');
    }
}

// Show the loading spinner when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // The loading spinner is already in the HTML with the 'hidden' class.
    // We don't need to do anything to show it initially with this setup.

    // You would typically call hideLoadingSpinner() when your main content has loaded
    // or your application is ready. For example, after fetching initial data.

    // For demonstration purposes, let's hide it after a short delay (replace this with your actual logic)
    setTimeout(hideLoadingSpinner, 2000); // Hide after 2 seconds
});
