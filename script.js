document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal');
    modal.style.display = 'none'; // Ensure modal is hidden on load

    const clockInOutForm = document.getElementById('clock-in-out-form');
    const absenceForm = document.getElementById('absence-form');
    
    const clockElement = document.getElementById('clock');
    const scriptURL = 'https://script.google.com/macros/s/AKfycbzIjKJxygDJmkddtzSMB8RpS-iUmZ1cF5bz-43kajXGPFrDhSdVqZQXMwBOcK7ol3FypQ/exec';

    // Live Clock
    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        clockElement.textContent = `${hours}:${minutes}:${seconds}`;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // Form Submissions
    clockInOutForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const action = e.submitter.value;
        const firstName = document.getElementById('firstName').value;
        const lastName = document.getElementById('lastName').value;
        const employeeId = document.getElementById('employeeId').value;

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const data = {
                    type: 'timelog',
                    firstName: firstName,
                    lastName: lastName,
                    employeeId: employeeId,
                    action: action,
                    timestamp: new Date().toLocaleString(),
                    rawTimestamp: new Date().toISOString(),
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    userAgent: navigator.userAgent,
                    deviceName: 'WebApp'
                };
                postToGoogleSheet(data, clockInOutForm);
            }, error => {
                console.error('Geolocation error:', error);
                const data = {
                    type: 'timelog',
                    firstName: firstName,
                    lastName: lastName,
                    employeeId: employeeId,
                    action: action,
                    timestamp: new Date().toLocaleString(),
                    rawTimestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    deviceName: 'WebApp'
                };
                postToGoogleSheet(data, clockInOutForm);
            });
        } else {
            const data = {
                type: 'timelog',
                firstName: firstName,
                lastName: lastName,
                employeeId: employeeId,
                action: action,
                timestamp: new Date().toLocaleString(),
                rawTimestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                deviceName: 'WebApp'
            };
            postToGoogleSheet(data, clockInOutForm);
        }
    });

    absenceForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const data = {
            type: 'absencelog',
            firstName: document.getElementById('absenceFirstName').value,
            lastName: document.getElementById('absenceLastName').value,
            employeeId: document.getElementById('absenceEmployeeId').value,
            reason: document.getElementById('reason').value,
            timestamp: new Date().toLocaleString(),
            rawTimestamp: new Date().toISOString(),
        };
        postToGoogleSheet(data, absenceForm);
    });

    function postToGoogleSheet(data, form) {
        const modal = document.getElementById('modal');
        const modalText = document.getElementById('modal-text');
        fetch(scriptURL, { method: 'POST', body: JSON.stringify(data) })
            .then(response => response.text())
            .then(data => {
                modalText.textContent = data;
                modal.classList.remove('hidden'); // Show the modal
                setTimeout(() => {
                    modal.classList.add('hidden'); // Hide after 3 seconds
                }, 3000);
                if(data.includes('added')){
                    form.reset();
                }
            })
            .catch(error => {
                modalText.textContent = "Error! " + error.message;
                modal.classList.remove('hidden'); // Show the modal
                setTimeout(() => {
                    modal.classList.add('hidden'); // Hide after 3 seconds
                }, 3000);
            });
    }

    

    // Modal Close
    const modalCloseBtn = document.getElementById('modal-close-btn');
    modalCloseBtn.addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
    });

    // FAQ Accordion
    const faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const answer = question.nextElementSibling;
            if (answer.style.maxHeight) {
                answer.style.maxHeight = null;
            } else {
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });
});

// Tab functionality
function openTab(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName('tab-content');
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = 'none';
    }
    tablinks = document.getElementsByClassName('tab-link');
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(' active', '');
    }
    document.getElementById(tabName).style.display = 'block';
    evt.currentTarget.className += ' active';

    // Initialize or update live map when Clock In/Out tab is active
    if (tabName === 'ClockInOut') {
        if (!liveMap) {
            liveMap = L.map('live-map').setView([0, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(liveMap);
        }
        // Attempt to get current location and update map
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                liveMap.setView([lat, lon], 15);
                L.marker([lat, lon]).addTo(liveMap)
                    .bindPopup('Your current location').openPopup();
            }, error => {
                console.error('Geolocation error for live map:', error);
                // Optionally, display a message to the user that geolocation failed
            });
        }
    }
}

