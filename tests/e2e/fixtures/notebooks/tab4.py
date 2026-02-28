import numpy as np
import argparse


def normalize(psi: np.ndarray, dx: float) -> np.ndarray:
    norm = np.sqrt(np.sum(np.abs(psi) ** 2) * dx)
    return psi / norm


def run_quantum_tunneling_simulation(
    n_grid: int = 2048,
    x_min: float = -200.0,
    x_max: float = 200.0,
    dt: float = 0.05,
    n_steps: int = 2200,
    snapshot_every: int = 250,
):
    """
    1D time-dependent Schrodinger equation simulation using split-operator FFT.
    Units are dimensionless with hbar = m = 1.
    """
    hbar = 1.0
    mass = 1.0

    x = np.linspace(x_min, x_max, n_grid, endpoint=False)
    dx = x[1] - x[0]
    k = 2.0 * np.pi * np.fft.fftfreq(n_grid, d=dx)

    # Square potential barrier in the middle (for tunneling demo)
    v0 = 0.12
    barrier_half_width = 8.0
    v = np.where(np.abs(x) < barrier_half_width, v0, 0.0)

    # Initial Gaussian wave packet moving right
    x0 = -90.0
    sigma = 10.0
    k0 = 0.55
    psi = np.exp(-((x - x0) ** 2) / (4.0 * sigma**2)) * np.exp(1j * k0 * x)
    psi = normalize(psi, dx)

    # Split-operator evolution factors
    exp_v_half = np.exp(-1j * v * dt / (2.0 * hbar))
    exp_t = np.exp(-1j * (hbar * k**2) * dt / (2.0 * mass))

    snapshots = [(0, np.abs(psi) ** 2)]
    norms = [np.sum(np.abs(psi) ** 2) * dx]

    for step in range(1, n_steps + 1):
        psi *= exp_v_half
        psi_k = np.fft.fft(psi)
        psi_k *= exp_t
        psi = np.fft.ifft(psi_k)
        psi *= exp_v_half

        if step % snapshot_every == 0 or step == n_steps:
            snapshots.append((step, np.abs(psi) ** 2))
            norms.append(np.sum(np.abs(psi) ** 2) * dx)

    prob = np.abs(psi) ** 2
    reflected = np.sum(prob[x < -barrier_half_width]) * dx
    transmitted = np.sum(prob[x > barrier_half_width]) * dx

    return {
        "x": x,
        "V": v,
        "snapshots": snapshots,
        "norms": np.array(norms),
        "R": reflected,
        "T": transmitted,
    }


def plot_results(result: dict):
    import matplotlib.pyplot as plt

    x = result["x"]
    v = result["V"]
    snapshots = result["snapshots"]
    norms = result["norms"]

    fig, axes = plt.subplots(2, 1, figsize=(10, 8), constrained_layout=True)

    ax = axes[0]
    for step, dens in snapshots:
        ax.plot(x, dens, lw=1.8, label=f"step={step}")
    ax.plot(x, v / (np.max(v) + 1e-12) * np.max(snapshots[0][1]), "k--", lw=2, label="scaled V(x)")
    ax.set_title("1D Quantum Tunneling (Probability Density)")
    ax.set_xlabel("x")
    ax.set_ylabel(r"$|\psi(x,t)|^2$")
    ax.legend(loc="upper right", fontsize=8)
    ax.grid(alpha=0.25)

    ax2 = axes[1]
    ax2.plot(norms, marker="o", lw=1.5)
    ax2.set_title("Norm Check (should stay near 1)")
    ax2.set_xlabel("snapshot index")
    ax2.set_ylabel(r"$\int |\psi|^2 dx$")
    ax2.grid(alpha=0.25)

    plt.show()

    print(f"Reflection probability R ≈ {result['R']:.4f}")
    print(f"Transmission probability T ≈ {result['T']:.4f}")
    print(f"R + T ≈ {result['R'] + result['T']:.4f}")


def solve_harmonic_oscillator(
    n_grid: int = 500,
    x_min: float = -8.0,
    x_max: float = 8.0,
    omega: float = 1.0,
    n_states: int = 4,
):
    """
    Solve stationary states of 1D quantum harmonic oscillator using finite differences.
    Units are dimensionless with hbar = m = 1.
    """
    x = np.linspace(x_min, x_max, n_grid)
    dx = x[1] - x[0]

    main_diag = -2.0 * np.ones(n_grid)
    off_diag = np.ones(n_grid - 1)
    d2 = (
        np.diag(main_diag, 0)
        + np.diag(off_diag, 1)
        + np.diag(off_diag, -1)
    ) / (dx**2)

    v = 0.5 * (omega**2) * (x**2)
    hamiltonian = -0.5 * d2 + np.diag(v)

    eigenvalues, eigenvectors = np.linalg.eigh(hamiltonian)
    eigenvalues = eigenvalues[:n_states]
    states = eigenvectors[:, :n_states]

    for i in range(states.shape[1]):
        states[:, i] = normalize(states[:, i], dx)

    return {"x": x, "V": v, "energies": eigenvalues, "states": states}


def plot_harmonic_oscillator(result: dict):
    import matplotlib.pyplot as plt

    x = result["x"]
    v = result["V"]
    energies = result["energies"]
    states = result["states"]

    plt.figure(figsize=(10, 6))
    plt.plot(x, v, "k--", lw=2, label="V(x)=x^2/2")

    for i, energy in enumerate(energies):
        psi = states[:, i]
        scale = 0.7
        plt.plot(x, scale * psi + energy, lw=1.8, label=f"n={i}, E={energy:.3f}")
        plt.hlines(energy, x[0], x[-1], colors="gray", linestyles=":", lw=0.8)

    plt.title("Quantum Harmonic Oscillator: Eigenstates and Energies")
    plt.xlabel("x")
    plt.ylabel("Energy / shifted wavefunction")
    plt.legend(loc="upper left", fontsize=9)
    plt.grid(alpha=0.25)
    plt.show()

    print("Lowest energies (numerical):")
    for i, energy in enumerate(energies):
        print(f"n={i}: E ≈ {energy:.6f} (exact: {i + 0.5:.6f})")


def solve_finite_square_well(
    n_grid: int = 700,
    x_min: float = -12.0,
    x_max: float = 12.0,
    well_depth: float = 8.0,
    well_width: float = 4.0,
    n_states: int = 4,
):
    """
    Solve bound states of a 1D finite square well using finite differences.
    Potential: V(x) = -well_depth for |x| <= well_width/2, else 0.
    """
    x = np.linspace(x_min, x_max, n_grid)
    dx = x[1] - x[0]

    main_diag = -2.0 * np.ones(n_grid)
    off_diag = np.ones(n_grid - 1)
    d2 = (
        np.diag(main_diag, 0)
        + np.diag(off_diag, 1)
        + np.diag(off_diag, -1)
    ) / (dx**2)

    v = np.where(np.abs(x) <= (well_width / 2.0), -well_depth, 0.0)
    hamiltonian = -0.5 * d2 + np.diag(v)

    eigenvalues, eigenvectors = np.linalg.eigh(hamiltonian)
    bound_indices = np.where(eigenvalues < 0.0)[0]

    if len(bound_indices) == 0:
        chosen = np.arange(min(n_states, len(eigenvalues)))
        only_bound = False
    else:
        chosen = bound_indices[:n_states]
        only_bound = True

    energies = eigenvalues[chosen]
    states = eigenvectors[:, chosen]

    for i in range(states.shape[1]):
        states[:, i] = normalize(states[:, i], dx)

    return {
        "x": x,
        "V": v,
        "energies": energies,
        "states": states,
        "bound_only": only_bound,
    }


def plot_finite_square_well(result: dict):
    import matplotlib.pyplot as plt

    x = result["x"]
    v = result["V"]
    energies = result["energies"]
    states = result["states"]

    plt.figure(figsize=(10, 6))
    plt.plot(x, v, "k--", lw=2.0, label="V(x)")

    state_scale = max(0.5, 0.15 * np.max(np.abs(v)))
    for i, energy in enumerate(energies):
        psi = states[:, i]
        plt.plot(x, state_scale * psi + energy, lw=1.7, label=f"state={i}, E={energy:.3f}")
        plt.hlines(energy, x[0], x[-1], colors="gray", linestyles=":", lw=0.8)

    plt.title("Finite Square Well: Bound-State Spectrum")
    plt.xlabel("x")
    plt.ylabel("Energy / shifted wavefunction")
    plt.legend(loc="upper right", fontsize=9)
    plt.grid(alpha=0.25)
    plt.show()

    if result["bound_only"]:
        print("Bound-state energies (E < 0):")
    else:
        print("No bound state found with current parameters. Showing lowest states:")
    for i, energy in enumerate(energies):
        print(f"state={i}: E ≈ {energy:.6f}")


def simulate_two_level_rabi(
    omega: float = 1.0,
    detuning: float = 0.2,
    t_max: float = 30.0,
    n_steps: int = 1200,
):
    """
    Two-level system (qubit) Rabi oscillation simulation.
    Hamiltonian: H = 0.5 * [[detuning, omega], [omega, -detuning]]
    Units are dimensionless with hbar = 1.
    """
    times = np.linspace(0.0, t_max, n_steps)
    hamiltonian = 0.5 * np.array(
        [[detuning, omega], [omega, -detuning]],
        dtype=np.complex128,
    )

    eigvals, eigvecs = np.linalg.eigh(hamiltonian)
    psi0 = np.array([1.0 + 0.0j, 0.0 + 0.0j], dtype=np.complex128)

    p0 = np.zeros_like(times)
    p1 = np.zeros_like(times)

    for i, t in enumerate(times):
        phase = np.exp(-1j * eigvals * t)
        u_t = eigvecs @ np.diag(phase) @ eigvecs.conj().T
        psi_t = u_t @ psi0
        p0[i] = np.abs(psi_t[0]) ** 2
        p1[i] = np.abs(psi_t[1]) ** 2

    return {"t": times, "P0": p0, "P1": p1, "omega": omega, "detuning": detuning}


def plot_rabi(result: dict):
    import matplotlib.pyplot as plt

    t = result["t"]
    p0 = result["P0"]
    p1 = result["P1"]

    plt.figure(figsize=(10, 5))
    plt.plot(t, p0, lw=2.0, label="P(|0>)")
    plt.plot(t, p1, lw=2.0, label="P(|1>)")
    plt.title("Two-Level Quantum Rabi Oscillation")
    plt.xlabel("time")
    plt.ylabel("probability")
    plt.ylim(-0.02, 1.02)
    plt.grid(alpha=0.25)
    plt.legend()
    plt.show()

    print(f"omega={result['omega']:.3f}, detuning={result['detuning']:.3f}")
    print(f"max P(|1>) ≈ {np.max(result['P1']):.4f}")


def parse_args():
    parser = argparse.ArgumentParser(description="Quantum mechanics simulations in 1D.")
    parser.add_argument(
        "--mode",
        choices=["tunnel", "oscillator", "well", "rabi"],
        default="tunnel",
        help="Simulation mode: 'tunnel', 'oscillator', 'well', or 'rabi'.",
    )
    # Use parse_known_args for notebook/IPython compatibility.
    args, _ = parser.parse_known_args()
    return args


def main(mode: str = "tunnel"):
    if mode == "tunnel":
        simulation_result = run_quantum_tunneling_simulation()
        plot_results(simulation_result)
    elif mode == "oscillator":
        oscillator_result = solve_harmonic_oscillator()
        plot_harmonic_oscillator(oscillator_result)
    elif mode == "well":
        well_result = solve_finite_square_well()
        plot_finite_square_well(well_result)
    else:
        rabi_result = simulate_two_level_rabi()
        plot_rabi(rabi_result)


if __name__ == "__main__":
    args = parse_args()
    main(args.mode)
