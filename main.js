        function toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const themeIcon = document.getElementById('themeIcon');
            const themeText = document.getElementById('themeText');

            if (currentTheme === 'light') {
                document.documentElement.removeAttribute('data-theme');
                themeIcon.textContent = '';
                themeText.textContent = 'Light Mode';
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                themeIcon.textContent = '';
                themeText.textContent = 'Dark Mode';
            }
        }

        function openProjectModal(name, url, files, readme) {
            document.getElementById('modalProjectName').textContent = name;
            document.getElementById('modalExternalLink').href = url;
            
            const fileArray = files.split(', ');
            let fileListHTML = `<li class="file-item">📁 repository root</li>`;
            fileArray.forEach(file => {
                fileListHTML += `<li class="file-item">📄 ${file}</li>`;
            });
            fileListHTML += `<li class="file-item">📄 README.md</li>`;
            
            document.getElementById('modalFileList').innerHTML = fileListHTML;
            document.getElementById('modalReadmeContent').innerHTML = `<p>${readme}</p>`;
            document.getElementById('modalOverlay').classList.add('active');
        }

        function closeProjectModal() {
            document.getElementById('modalOverlay').classList.remove('active');
        }

        function closeModalOnOverlay(event) {
            if (event.target.id === 'modalOverlay') {
                closeProjectModal();
            }
        }