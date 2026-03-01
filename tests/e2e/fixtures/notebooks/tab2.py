# ---
# jupyter:
#   jupytext:
#     formats: ipynb,py:percent
#     text_representation:
#       extension: .py
#       format_name: percent
#       format_version: '1.3'
#       jupytext_version: 1.17.2
#   kernelspec:
#     display_name: Python 3 (ipykernel)
#     language: python
#     name: python3
# ---

# %%
import numpy as np


def simulate_schrodinger_1d(
    n_grid: int = 1024,
    x_min: float = -20.0,
    x_max: float = 20.0,
    dt: float = 0.005,
    steps: int = 2500,
    save_every: int = 250,
    potential_type: str = "harmonic",
    omega: float = 0.2,
    barrier_height: float = 1.5,
    barrier_width: float = 1.5,
    x0: float = -7.0,
    sigma: float = 1.0,
    k0: float = 2.0,
) -> dict[str, object]:
    """
    Simulate a 1D wave packet under the time-dependent Schrodinger equation
    using a split-operator FFT method in natural units (hbar = m = 1).
    """
    if not isinstance(n_grid, int) or isinstance(n_grid, bool):
        raise TypeError("n_grid must be int")
    if n_grid < 64:
        raise ValueError("n_grid must be >= 64")
    if x_max <= x_min:
        raise ValueError("x_max must be greater than x_min")
    if dt <= 0:
        raise ValueError("dt must be > 0")
    if not isinstance(steps, int) or isinstance(steps, bool) or steps < 1:
        raise ValueError("steps must be an int >= 1")
    if not isinstance(save_every, int) or isinstance(save_every, bool) or save_every < 1:
        raise ValueError("save_every must be an int >= 1")
    if sigma <= 0:
        raise ValueError("sigma must be > 0")

    x = np.linspace(x_min, x_max, n_grid, endpoint=False)
    dx = x[1] - x[0]

    if potential_type == "harmonic":
        if omega < 0:
            raise ValueError("omega must be >= 0")
        potential = 0.5 * (omega**2) * (x**2)
    elif potential_type == "barrier":
        if barrier_width < 0:
            raise ValueError("barrier_width must be >= 0")
        potential = np.where(np.abs(x) < barrier_width / 2.0, barrier_height, 0.0)
    else:
        raise ValueError("potential_type must be 'harmonic' or 'barrier'")

    psi = np.exp(-((x - x0) ** 2) / (2.0 * sigma**2)) * np.exp(1j * k0 * x)

    def norm(wavefunc: np.ndarray) -> float:
        return float(np.sum(np.abs(wavefunc) ** 2) * dx)

    def expected_x(wavefunc: np.ndarray) -> float:
        density = np.abs(wavefunc) ** 2
        return float(np.sum(x * density) * dx)

    def total_energy(wavefunc: np.ndarray) -> float:
        grad = np.gradient(wavefunc, dx)
        kinetic = 0.5 * np.sum(np.abs(grad) ** 2) * dx
        potential_energy = np.sum(potential * (np.abs(wavefunc) ** 2)) * dx
        return float(np.real(kinetic + potential_energy))

    psi /= np.sqrt(norm(psi))
    k = 2.0 * np.pi * np.fft.fftfreq(n_grid, d=dx)
    kinetic_phase = np.exp(-0.5j * (k**2) * dt)
    potential_half_phase = np.exp(-0.5j * potential * dt)

    snapshots: list[tuple[float, np.ndarray]] = [(0.0, np.abs(psi) ** 2)]
    norm_history = [norm(psi)]
    x_expect_history = [expected_x(psi)]
    energy_history = [total_energy(psi)]

    for step in range(1, steps + 1):
        psi = potential_half_phase * psi
        psi_k = np.fft.fft(psi)
        psi_k = kinetic_phase * psi_k
        psi = np.fft.ifft(psi_k)
        psi = potential_half_phase * psi
        psi /= np.sqrt(norm(psi))

        current_norm = norm(psi)
        norm_history.append(current_norm)
        x_expect_history.append(expected_x(psi))
        energy_history.append(total_energy(psi))

        if step % save_every == 0:
            snapshots.append((step * dt, np.abs(psi) ** 2))

    if steps % save_every != 0:
        snapshots.append((steps * dt, np.abs(psi) ** 2))

    return {
        "x": x,
        "V": potential,
        "psi": psi,
        "dx": dx,
        "dt": dt,
        "steps": steps,
        "snapshots": snapshots,
        "final_norm": norm(psi),
        "norm_history": np.array(norm_history),
        "x_expect_history": np.array(x_expect_history),
        "energy_history": np.array(energy_history),
    }


def validate_simulation(
    result: dict[str, object],
    norm_tolerance: float = 1e-6,
    energy_tolerance: float = 0.6,
) -> None:
    norms = np.asarray(result["norm_history"], dtype=float)
    if not np.all(np.isclose(norms, 1.0, atol=norm_tolerance)):
        min_norm = float(np.min(norms))
        max_norm = float(np.max(norms))
        raise AssertionError(
            f"norm preservation failed: min={min_norm:.8f}, max={max_norm:.8f}"
        )
    energies = np.asarray(result["energy_history"], dtype=float)
    if energies.size > 1:
        drift = float(np.max(energies) - np.min(energies))
        if drift > energy_tolerance:
            raise AssertionError(f"energy drift too large: {drift:.6f}")


def transmission_reflection_probabilities(
    result: dict[str, object],
    split_x: float = 0.0,
) -> tuple[float, float]:
    x = np.asarray(result["x"], dtype=float)
    psi = np.asarray(result["psi"], dtype=np.complex128)
    dx = float(result["dx"])
    density = np.abs(psi) ** 2
    reflection = float(np.sum(density[x < split_x]) * dx)
    transmission = float(np.sum(density[x >= split_x]) * dx)
    return transmission, reflection


def plot_simulation(result: dict[str, object]) -> None:
    import matplotlib.pyplot as plt

    x = np.asarray(result["x"])
    potential = np.asarray(result["V"])
    snapshots = result["snapshots"]

    max_density = max(float(np.max(density)) for _, density in snapshots)
    shifted = potential - float(np.min(potential))
    vmax = float(np.max(shifted))
    if vmax > 0:
        scaled_potential = (shifted / vmax) * (0.8 * max_density)
    else:
        scaled_potential = np.zeros_like(potential)

    plt.figure(figsize=(10, 5))
    plt.plot(x, scaled_potential, "k--", linewidth=1.2, label="Scaled potential")
    for time_point, density in snapshots:
        plt.plot(x, density, label=f"t = {time_point:.2f}")
    plt.title("1D Time-Dependent Schrodinger Simulation")
    plt.xlabel("x")
    plt.ylabel(r"Probability density $|\psi(x,t)|^2$")
    plt.legend(ncol=2)
    plt.grid(alpha=0.25)
    plt.tight_layout()
    plt.show()


def run_demo(enable_plot: bool = False) -> None:
    harmonic_result = simulate_schrodinger_1d(
        potential_type="harmonic",
        omega=0.2,
        x0=-7.0,
        k0=2.0,
    )
    validate_simulation(harmonic_result)

    final_norm = float(harmonic_result["final_norm"])
    x_expect = np.asarray(harmonic_result["x_expect_history"], dtype=float)
    print("Harmonic oscillator")
    print(f"Final norm: {final_norm:.6f}")
    print(
        "Expectation x range:",
        f"[{float(np.min(x_expect)):.3f}, {float(np.max(x_expect)):.3f}]",
    )

    barrier_result = simulate_schrodinger_1d(
        potential_type="barrier",
        barrier_height=1.5,
        barrier_width=1.5,
        x0=-10.0,
        k0=2.2,
        steps=3000,
    )
    validate_simulation(barrier_result)
    transmission, reflection = transmission_reflection_probabilities(
        barrier_result,
        split_x=0.0,
    )
    assert np.isclose(transmission + reflection, 1.0, atol=1e-5)
    print("Barrier tunneling")
    print(
        "Transmission / Reflection:",
        f"{transmission:.4f} / {reflection:.4f}",
    )
    print("Validation passed.")

    if enable_plot:
        plot_simulation(harmonic_result)
        plot_simulation(barrier_result)


run_demo(enable_plot=False)
