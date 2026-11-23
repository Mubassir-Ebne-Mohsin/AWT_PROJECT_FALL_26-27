const runLetters = ["N", "R", "U", ""];
const testLetters = ["", "", "", "t", "s", "", "e", "T"];

export function LoginArt() {
  return (
    <div className="auth-side paper sf-login-art" aria-hidden="true">
      <div className="scene">
        <div className="sphere">
          <div className="ball" />
          {[..."Build"].map((letter) => (
            <span key={letter} className="letter">{letter}</span>
          ))}
        </div>

        <div className="run-stage">
          <div className="rb-wrap">
            {runLetters.map((letter) => (
              <div key={letter} className="rb">
                <div>{letter && <span className="letter">{letter}</span>}</div>
                <div />
                <div />
                <div />
              </div>
            ))}
          </div>
        </div>

        <div className="cube-stage">
          <div className="loader">
            {testLetters.map((letter, index) => (
              <div key={index} className={"box box" + index}>
                <div data-test-letter={letter || undefined} />
              </div>
            ))}
            <div className="ground"><div /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
