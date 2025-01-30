// Animation loop with improved target animations
function animate() {
    requestAnimationFrame(animate);
    
    if (!isGameOver) {
        updatePosition();
        updateUI();
        
        // Apply rotations in correct order using quaternions
        camera.quaternion.setFromEuler(new THREE.Euler(0, mouseX, 0, 'YXZ'));
        camera.rotateX(-mouseY);
        
        // Animate targets
        targets.forEach((t, i) => {
            t.rotation.y += 0.02;
            t.position.y = 0.5 + Math.sin(Date.now() * 0.003 + i) * 0.2;
        });
        
        renderer.render(scene, camera);
    }
}

// Initialize game
function initGame() {
    // Initial game state
    window.score = 0;
    window.round = 1;
    window.ammo = maxAmmo;
    window.health = 100;
    window.kills = 0;
    window.gameTime = 0;
    window.isGameOver = false;

    // Reset camera position and rotation
    camera.position.set(0, gameConfig.scene.playerHeight, 0);
    window.mouseX = 0;
    window.mouseY = 0;

    // Initialize game elements
    spawnTargets();
    updateUI();

    // Start game timer
    window.gameTimer = setInterval(updateTimer, 1000);

    // Start animation loop
    animate();
}

// Event listener for DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    initGame();
    document.body.requestPointerLock();
});

// Export functions
window.animate = animate;
window.initGame = initGame;
